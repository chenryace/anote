import { FC, useEffect, useState, useCallback, KeyboardEvent as ReactKeyboardEvent, useRef, CompositionEvent, CompositionEvent as ReactCompositionEvent } from 'react';
import { use100vh } from 'react-div-100vh';
import MarkdownEditor, { Props } from '@notea/rich-markdown-editor';
import { useEditorTheme } from './theme';
import useMounted from 'libs/web/hooks/use-mounted';
import Tooltip from './tooltip';
import extensions from './extensions';
import EditorState from 'libs/web/state/editor';
import { useToast } from 'libs/web/hooks/use-toast';
import { useDictionary } from './dictionary';
import { useEmbeds } from './embeds';

export interface EditorProps extends Pick<Props, 'readOnly'> {
    isPreview?: boolean;
}

const Editor: FC<EditorProps> = ({ readOnly, isPreview }) => {
    const {
        onSearchLink,
        onCreateLink,
        onClickLink,
        onUploadImage,
        onHoverLink,
        onEditorChange,
        backlinks,
        editorEl,
        note,
    } = EditorState.useContainer();
    const height = use100vh();
    const mounted = useMounted();
    const editorTheme = useEditorTheme();
    const [hasMinHeight, setHasMinHeight] = useState(true);
    const toast = useToast();
    const dictionary = useDictionary();
    const embeds = useEmbeds();
    
    // 状态管理 - 增强版
    const [isComposing, setIsComposing] = useState(false);
    const isEditorLocked = useRef(false);
    const lastInputValue = useRef("");
    const compositionStateRef = useRef({
        isActive: false,           // 当前是否处于组合输入状态
        startTime: 0,              // 组合输入开始时间
        endTime: 0,                // 组合输入结束时间
        pendingChars: '',          // 待处理的特殊字符
        lastSelection: { from: 0, to: 0 } // 上次选择范围
    });

    useEffect(() => {
        if (isPreview) return;
        setHasMinHeight((backlinks?.length ?? 0) <= 0);
    }, [backlinks, isPreview]);

    // 处理斜杠命令
    const handleSlashCommand = useCallback(() => {
        if (!editorEl.current || !editorEl.current.view) return;
        
        console.log('处理斜杠命令');
        
        // 延迟触发命令菜单，确保浏览器完成组合输入处理
        setTimeout(() => {
            if (editorEl.current && editorEl.current.view) {
                // 触发命令菜单
                editorEl.current.view.dispatch(
                    editorEl.current.view.state.tr.setMeta('show-command-menu', true)
                );
            }
        }, 10);
    }, [editorEl]);

    // 处理Markdown命令
    const handleMarkdownCommand = useCallback((command: string) => {
        if (!editorEl.current || !editorEl.current.view) return;
        
        console.log(`处理Markdown命令: ${command}`);
        
        // 延迟处理，确保浏览器完成组合输入处理
        setTimeout(() => {
            if (editorEl.current && editorEl.current.view) {
                // 刷新视图，确保格式化正确应用
                editorEl.current.view.dispatch(editorEl.current.view.state.tr);
            }
        }, 10);
    }, [editorEl]);

    // 处理待处理的特殊字符
    const handlePendingSpecialChars = useCallback((chars: string) => {
        if (!editorEl.current || !editorEl.current.view) return;
        
        console.log('处理待处理的特殊字符:', chars);
        
        // 处理斜杠命令
        if (chars.includes('/')) {
            handleSlashCommand();
        }
        
        // 处理其他Markdown命令
        if (chars.includes('#')) {
            handleMarkdownCommand('#');
        }
        
        if (chars.includes('*')) {
            handleMarkdownCommand('*');
        }
        
        // 处理其他特殊字符...
    }, [editorEl, handleSlashCommand, handleMarkdownCommand]);

    // 添加组合输入更新事件处理 - 修改参数类型为 Event
    const handleCompositionUpdate = useCallback((e: Event) => {
        // 记录组合输入过程中的状态
        compositionStateRef.current.isActive = true;
        
        // 检查是否包含特殊字符，但不立即处理
        // 注意：由于类型问题，我们需要将 e 转换为 CompositionEvent
        const compositionEvent = e as unknown as CompositionEvent;
        if (compositionEvent.data) {
            const specialChars = ['/', '#', '*', '>', '`', '-', '+', '=', '[', ']', '(', ')', '!', '@'];
            for (const char of specialChars) {
                if (compositionEvent.data.includes(char)) {
                    compositionStateRef.current.pendingChars += char;
                }
            }
        }
    }, []);

    // 修改编辑器变化处理
    const handleEditorChange = useCallback(() => {
        if (!editorEl.current || !editorEl.current.view) return;
        
        const { state } = editorEl.current.view;
        const content = state.doc.textContent;
        
        // 只在非组合输入状态下更新
        if (!isComposing) {
            // 更新localStorage
            if (note?.id) {
                try {
                    const notes = JSON.parse(localStorage.getItem('notes') || '{}');
                    notes[note.id] = {
                        ...note,
                        content,
                        updatedAt: new Date().toISOString()
                    };
                    localStorage.setItem('notes', JSON.stringify(notes));
                } catch (err) {
                    console.error('Failed to save to localStorage:', err);
                }
            }
            
            // 调用原始的onChange处理
            onEditorChange(() => content);
        }
    }, [isComposing, onEditorChange, note]);

    // 修改组合输入开始处理
    const handleCompositionStart = useCallback((e: React.CompositionEvent<HTMLDivElement>) => {
        console.log('组合输入开始');
        setIsComposing(true);
        isEditorLocked.current = true;
        
        // 更新组合输入状态
        compositionStateRef.current.isActive = true;
        compositionStateRef.current.startTime = Date.now();
        compositionStateRef.current.pendingChars = '';
        
        // 保存当前光标位置的内容
        if (editorEl.current && editorEl.current.view) {
            const { state } = editorEl.current.view;
            const { from, to } = state.selection;
            lastInputValue.current = state.doc.textBetween(from, to);
            compositionStateRef.current.lastSelection = { from, to };
        }
    }, [editorEl]);

    // 修改组合输入结束处理
    const handleCompositionEnd = useCallback((e: React.CompositionEvent<HTMLDivElement>) => {
        console.log('组合输入结束');
        setIsComposing(false);
        isEditorLocked.current = false;
        
        // 更新组合输入状态
        compositionStateRef.current.isActive = false;
        compositionStateRef.current.endTime = Date.now();
        
        if (editorEl.current && editorEl.current.view) {
            const { state } = editorEl.current.view;
            const { from, to } = state.selection;
            const currentValue = state.doc.textBetween(from, to);
            
            // 检查是否有重复输入
            if (currentValue.includes(lastInputValue.current) && 
                currentValue.length > lastInputValue.current.length) {
                // 如果检测到重复输入，只保留新输入的内容
                const newContent = currentValue.slice(lastInputValue.current.length);
                editorEl.current.view.dispatch(
                    state.tr
                        .delete(from, to)
                        .insertText(newContent, from)
                );
            }
            
            // 更新最后一次输入值
            lastInputValue.current = currentValue;
            
            // 处理待处理的特殊字符
            if (compositionStateRef.current.pendingChars) {
                // 延迟处理特殊字符，确保浏览器完成组合输入处理
                setTimeout(() => {
                    handlePendingSpecialChars(compositionStateRef.current.pendingChars);
                    compositionStateRef.current.pendingChars = '';
                }, 10);
            }
        }
        
        // 延迟触发编辑器变化，确保浏览器完成组合输入处理
        setTimeout(() => {
            handleEditorChange();
        }, 10);
    }, [editorEl, handleEditorChange, handlePendingSpecialChars]);

    // 添加 composed 函数
    const composed = useCallback(() => {
        if (isComposing) {
            setIsComposing(false);
            isEditorLocked.current = false;
            // 手动触发 compositionend 事件
            if (editorEl.current && editorEl.current.element) {
                editorEl.current.element.dispatchEvent(new Event('compositionend'));
            }
        }
    }, [isComposing, editorEl]);

    // 修改键盘事件处理
    const handleKeyDown = useCallback((e: ReactKeyboardEvent) => {
        console.log(`键盘事件: ${e.key}, 组合状态: ${isComposing}`);
        
        // 处理 / 键 - 无论在什么状态下都应该触发命令菜单
        if (e.key === '/') {
            // 如果在组合输入状态，先结束组合输入
            if (isComposing) {
                composed();
            }
            
            e.preventDefault();
            
            if (editorEl.current && editorEl.current.view) {
                const { state } = editorEl.current.view;
                const { from, to } = state.selection;
                
                // 插入 / 字符
                editorEl.current.view.dispatch(
                    state.tr
                        .delete(from, to)
                        .insertText('/', from)
                );
                
                // 触发命令菜单
                setTimeout(() => {
                    if (editorEl.current && editorEl.current.view) {
                        editorEl.current.view.dispatch(
                            editorEl.current.view.state.tr.setMeta('show-command-menu', true)
                        );
                    }
                }, 10);
            }
            return;
        }
        
        // 处理组合输入状态下的按键
        if (isComposing) {
            // 数字键1-9通常用于中文输入法选词
            if (/^[1-9]$/.test(e.key)) {
                return; // 不阻止默认行为，让输入法处理选词
            }
            
            // Enter键通常用于确认选词
            if (e.key === 'Enter') {
                return; // 不阻止默认行为，让输入法处理选词
            }
            
            // Shift键可能用于切换输入法
            if (e.key === 'Shift') {
                return; // 不阻止默认行为
            }
            
            // 方向键和删除键应该正常工作
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Backspace', 'Delete'].includes(e.key)) {
                return; // 不阻止默认行为
            }
        } else {
            // 非组合输入状态下的处理
            
            // 处理其他特殊字符
            const specialChars = ['#', '*', '>', '`', '-', '+', '=', '[', ']', '(', ')', '!', '@'];
            if (specialChars.includes(e.key)) {
                e.preventDefault();
                
                if (editorEl.current && editorEl.current.view) {
                    const { state } = editorEl.current.view;
                    const { from, to } = state.selection;
                    
                    // 插入命令字符
                    editorEl.current.view.dispatch(
                        state.tr
                            .delete(from, to)
                            .insertText(e.key, from)
                    );
                }
            }
        }
    }, [editorEl, isComposing, composed]);

    // 添加安全机制，防止编辑器永久锁定
    useEffect(() => {
        const safetyTimer = setInterval(() => {
            // 如果编辑器锁定但不在组合输入状态，强制解锁
            if (isEditorLocked.current && !isComposing) {
                console.log('安全机制：强制解锁编辑器');
                isEditorLocked.current = false;
            }
            
            // 检查组合输入状态是否异常
            const now = Date.now();
            if (compositionStateRef.current.isActive && 
                (now - compositionStateRef.current.startTime > 10000)) {
                console.log('安全机制：检测到异常的组合输入状态，强制结束');
                compositionStateRef.current.isActive = false;
                setIsComposing(false);
                isEditorLocked.current = false;
            }
        }, 5000); // 每5秒检查一次
        
        return () => clearInterval(safetyTimer);
    }, [isComposing]);

    // 设置编辑器事件监听
    useEffect(() => {
        if (!editorEl.current || isPreview || readOnly) return;
    
        const editorDom = editorEl.current.element;
        if (!editorDom) return;
    
        // 添加事件监听
        editorDom.addEventListener('compositionstart', handleCompositionStart);
        editorDom.addEventListener('compositionupdate', handleCompositionUpdate);
        editorDom.addEventListener('compositionend', handleCompositionEnd);
        
        // 添加输入事件监听
        const handleInput = (e: Event) => {
            console.log('输入事件', e);
            
            // 检查是否刚刚完成组合输入
            const timeSinceCompositionEnd = Date.now() - compositionStateRef.current.endTime;
            if (timeSinceCompositionEnd < 100 && compositionStateRef.current.pendingChars) {
                // 处理特殊字符
                handlePendingSpecialChars(compositionStateRef.current.pendingChars);
                compositionStateRef.current.pendingChars = '';
            }
        };
        
        editorDom.addEventListener('input', handleInput);
    
        return () => {
            editorDom.removeEventListener('compositionstart', handleCompositionStart);
            editorDom.removeEventListener('compositionupdate', handleCompositionUpdate);
            editorDom.removeEventListener('compositionend', handleCompositionEnd);
            editorDom.removeEventListener('input', handleInput);
        };
    }, [editorEl, isPreview, readOnly, handleCompositionStart, handleCompositionUpdate, handleCompositionEnd, handlePendingSpecialChars]);

    return (
        <>
            <div 
                onKeyDown={handleKeyDown}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
            >
                <MarkdownEditor
                    readOnly={readOnly}
                    id={note?.id}
                    ref={editorEl}
                    value={mounted ? note?.content : ''}
                    onChange={handleEditorChange}
                    placeholder={dictionary.editorPlaceholder}
                    theme={editorTheme}
                    uploadImage={(file) => onUploadImage(file, note?.id)}
                    onSearchLink={onSearchLink}
                    onCreateLink={onCreateLink}
                    onClickLink={onClickLink}
                    onHoverLink={onHoverLink}
                    onShowToast={toast}
                    dictionary={dictionary}
                    tooltip={Tooltip}
                    extensions={extensions}
                    className="px-4 md:px-0"
                    embeds={embeds}
                />
            </div>
            <style jsx global>{`
                .ProseMirror ul {
                    list-style-type: disc;
                }

                .ProseMirror ol {
                    list-style-type: decimal;
                }

                .ProseMirror {
                    ${hasMinHeight
                        ? `min-height: calc(${
                              height ? height + 'px' : '100vh'
                          } - 14rem);`
                        : ''}
                    padding-bottom: 10rem;
                }

                .ProseMirror h1 {
                    font-size: 2.8em;
                }
                .ProseMirror h2 {
                    font-size: 1.8em;
                }
                .ProseMirror h3 {
                    font-size: 1.5em;
                }
                .ProseMirror a:not(.bookmark) {
                    text-decoration: underline;
                }

                .ProseMirror .image .ProseMirror-selectednode img {
                    pointer-events: unset;
                }
            `}</style>
        </>
    );
};

export default Editor;

// 处理斜杠命令
const handleSlashCommand = useCallback(() => {
    if (!editorEl.current || !editorEl.current.view) return;
    
    console.log('处理斜杠命令');
    
    // 延迟触发命令菜单，确保浏览器完成组合输入处理
    setTimeout(() => {
        if (editorEl.current && editorEl.current.view) {
            // 触发命令菜单
            editorEl.current.view.dispatch(
                editorEl.current.view.state.tr.setMeta('show-command-menu', true)
            );
        }
    }, 10);
}, [editorEl]);

// 处理Markdown命令
const handleMarkdownCommand = useCallback((command: string) => {
    if (!editorEl.current || !editorEl.current.view) return;
    
    console.log(`处理Markdown命令: ${command}`);
    
    // 延迟处理，确保浏览器完成组合输入处理
    setTimeout(() => {
        if (editorEl.current && editorEl.current.view) {
            // 刷新视图，确保格式化正确应用
            editorEl.current.view.dispatch(editorEl.current.view.state.tr);
        }
    }, 10);
}, [editorEl]);

// 处理待处理的特殊字符
const handlePendingSpecialChars = useCallback((chars: string) => {
    if (!editorEl.current || !editorEl.current.view) return;
    
    console.log('处理待处理的特殊字符:', chars);
    
    // 处理斜杠命令
    if (chars.includes('/')) {
        handleSlashCommand();
    }
    
    // 处理其他Markdown命令
    if (chars.includes('#')) {
        handleMarkdownCommand('#');
    }
    
    if (chars.includes('*')) {
        handleMarkdownCommand('*');
    }
    
    // 处理其他特殊字符...
}, [editorEl, handleSlashCommand, handleMarkdownCommand]);

// 添加组合输入更新事件处理
const handleCompositionUpdate = useCallback((e: CompositionEvent) => {
    // 记录组合输入过程中的状态
    compositionStateRef.current.isActive = true;
    
    // 检查是否包含特殊字符，但不立即处理
    if (e.data) {
        const specialChars = ['/', '#', '*', '>', '`', '-', '+', '=', '[', ']', '(', ')', '!', '@'];
        for (const char of specialChars) {
            if (e.data.includes(char)) {
                compositionStateRef.current.pendingChars += char;
            }
        }
    }
}, []);

// 添加安全机制，防止编辑器永久锁定
useEffect(() => {
    const safetyTimer = setInterval(() => {
        // 如果编辑器锁定但不在组合输入状态，强制解锁
        if (isEditorLocked.current && !isComposing) {
            console.log('安全机制：强制解锁编辑器');
            isEditorLocked.current = false;
        }
        
        // 检查组合输入状态是否异常
        const now = Date.now();
        if (compositionStateRef.current.isActive && 
            (now - compositionStateRef.current.startTime > 10000)) {
            console.log('安全机制：检测到异常的组合输入状态，强制结束');
            compositionStateRef.current.isActive = false;
            setIsComposing(false);
            isEditorLocked.current = false;
        }
    }, 5000); // 每5秒检查一次
    
    return () => clearInterval(safetyTimer);
}, [isComposing]);
};

export default Editor;
