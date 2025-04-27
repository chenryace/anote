import { FC, useEffect, useState, useCallback, KeyboardEvent as ReactKeyboardEvent, useRef, CompositionEvent as ReactCompositionEvent } from 'react';
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
    
    // 使用本地状态跟踪组合输入
    const [isComposing, setIsComposing] = useState(false);
    // 存储组合输入期间的特殊字符和命令
    const pendingChars = useRef<string>("");
    // 创建MutationObserver引用
    const observerRef = useRef<MutationObserver | null>(null);
    // 跟踪编辑器状态是否被锁定
    const isEditorLocked = useRef<boolean>(false);
    // 跟踪是否需要处理特殊字符
    const needsSpecialCharHandling = useRef<boolean>(false);
    // 跟踪组合输入的内容类型（中文/英文）
    const compositionType = useRef<'chinese' | 'english' | null>(null);
    // 跟踪组合输入结束后的首次键盘事件
    const isFirstKeyAfterComposition = useRef<boolean>(false);

    useEffect(() => {
        if (isPreview) return;
        setHasMinHeight((backlinks?.length ?? 0) <= 0);
    }, [backlinks, isPreview]);

    // 添加处理Markdown格式化命令的函数
    const handleMarkdownCommand = useCallback((command: string) => {
        if (!editorEl.current || !editorEl.current.view) return;
        
        console.log(`处理Markdown命令: ${command}`);
        
        // 根据命令类型执行相应操作
        switch (command) {
            case '*':
            case '**':
                // 强制刷新视图，确保格式化正确应用
                setTimeout(() => {
                    if (editorEl.current && editorEl.current.view) {
                        editorEl.current.view.dispatch(editorEl.current.view.state.tr);
                    }
                }, 10);
                break;
            case '/':
                // 处理斜杠命令，确保命令菜单显示
                setTimeout(() => {
                    if (editorEl.current && editorEl.current.view) {
                        // 模拟斜杠命令触发
                        const { state } = editorEl.current.view;
                        editorEl.current.view.dispatch(state.tr.insertText('/'));
                    }
                }, 10);
                break;
            default:
                break;
        }
    }, [editorEl]);

    // 添加组合事件处理函数
    const handleCompositionStart = useCallback((e: ReactCompositionEvent<HTMLDivElement>) => {
        console.log('输入法组合开始');
        setIsComposing(true);
        // 清空待处理字符
        pendingChars.current = "";
        // 锁定编辑器状态
        isEditorLocked.current = true;
        // 重置特殊字符处理标志
        needsSpecialCharHandling.current = false;
        // 重置首次键盘事件标志
        isFirstKeyAfterComposition.current = false;
        
        // 根据首个字符判断输入类型
        if (e.data && /[\u4e00-\u9fa5]/.test(e.data)) {
            compositionType.current = 'chinese';
        } else {
            compositionType.current = 'english';
        }
    }, []);

    const handleCompositionUpdate = useCallback((e: ReactCompositionEvent<HTMLDivElement>) => {
        // 根据组合文本内容动态判断输入类型
        if (e.data && /[\u4e00-\u9fa5]/.test(e.data)) {
            compositionType.current = 'chinese';
        } else if (e.data && /^[a-zA-Z0-9\s]+$/.test(e.data)) {
            compositionType.current = 'english';
        }
    }, []);

    const handleCompositionEnd = useCallback((_e: ReactCompositionEvent<HTMLDivElement>) => {
        console.log('输入法组合结束');
        
        // 如果有特殊字符需要处理，设置标志
        if (pendingChars.current) {
            needsSpecialCharHandling.current = true;
        }
        
        // 重置组合状态
        setIsComposing(false);
        
        // 立即解锁编辑器，不添加延迟
        isEditorLocked.current = false;
        
        // 标记下一个键盘事件为组合后的首次事件
        isFirstKeyAfterComposition.current = true;
        
        // 强制刷新编辑器状态，确保后续操作可以执行
        setTimeout(() => {
            if (editorEl.current && editorEl.current.view) {
                editorEl.current.view.dispatch(editorEl.current.view.state.tr);
            }
        }, 10);
    }, [editorEl]);

    // 添加编辑器DOM引用的事件监听和MutationObserver
    useEffect(() => {
        if (!editorEl.current || isPreview || readOnly) return;

        // 获取编辑器的DOM元素
        const editorDom = editorEl.current.element;
        if (!editorDom) return;

        // 添加组合事件监听
        editorDom.addEventListener('compositionstart', handleCompositionStart as any);
        editorDom.addEventListener('compositionupdate', handleCompositionUpdate as any);
        editorDom.addEventListener('compositionend', handleCompositionEnd as any);
        
        // 创建MutationObserver来监听DOM变化
        const observer = new MutationObserver((mutations) => {
            // 如果不需要处理特殊字符，直接返回
            if (!needsSpecialCharHandling.current) return;
            
            // 检查是否有文本内容变化
            const hasTextChange = mutations.some(mutation => 
                mutation.type === 'characterData' || 
                mutation.type === 'childList' || 
                mutation.addedNodes.length > 0 || 
                mutation.removedNodes.length > 0
            );
            
            if (hasTextChange) {
                // 处理特殊字符
                if (pendingChars.current.includes('/')) {
                    // 处理斜杠命令
                    handleMarkdownCommand('/');
                } else if (pendingChars.current.includes('*')) {
                    // 处理加粗/斜体命令
                    handleMarkdownCommand('*');
                } else if (pendingChars.current.includes('#')) {
                    // 处理标题命令
                    handleMarkdownCommand('#');
                }
                
                // 重置待处理状态
                needsSpecialCharHandling.current = false;
                pendingChars.current = "";
            }
        });
        
        // 保存observer引用以便清理
        observerRef.current = observer;
        
        // 开始观察编辑器DOM变化
        observer.observe(editorDom, {
            childList: true,
            subtree: true,
            characterData: true,
            characterDataOldValue: true
        });

        // 添加安全机制，防止编辑器永久锁定
        const safetyTimer = setInterval(() => {
            // 如果编辑器锁定但不在组合输入状态，强制解锁
            if (isEditorLocked.current && !isComposing) {
                console.log('安全机制：检测到异常锁定状态，强制解锁');
                isEditorLocked.current = false;
            }
        }, 1000); // 安全检查间隔

        return () => {
            // 清理事件监听和MutationObserver
            editorDom.removeEventListener('compositionstart', handleCompositionStart as any);
            editorDom.removeEventListener('compositionupdate', handleCompositionUpdate as any);
            editorDom.removeEventListener('compositionend', handleCompositionEnd as any);
            if (observerRef.current) {
                observerRef.current.disconnect();
                observerRef.current = null;
            }
            // 清理安全定时器
            clearInterval(safetyTimer);
        };
    }, [editorEl, isPreview, readOnly, handleCompositionStart, handleCompositionUpdate, handleCompositionEnd, handleMarkdownCommand, isComposing]);

    
    // 自定义键盘事件处理，解决中文输入法下斜杠命令和特殊字符问题
    const handleKeyDown = useCallback((e: ReactKeyboardEvent) => {
        // 定义需要特殊处理的Markdown语法字符
        const specialChars = ['/', '#', '*', '>', '`', '-', '+', '=', '[', ']', '(', ')', '!', '@'];
        
        // 处理通过数字键选择候选词的情况
        if (isComposing && e.key >= '1' && e.key <= '9') {
            console.log(`组合输入中通过数字键选择候选词: ${e.key}`);
            // 不阻止默认行为，让输入法正常处理
            return;
        }
        
        // 处理可能的输入速度过快导致的Enter键无效问题
        if (e.key === 'Enter' && e.nativeEvent && e.nativeEvent.isComposing) {
            console.log('检测到可能的输入速度过快导致的Enter键');
            // 确保编辑器不会锁定Enter键
            isEditorLocked.current = false;
            // 不阻止默认行为，允许Enter键正常工作
            return;
        }
        
        // 处理中文输入法下输入英文后无法换行或删除的问题
        if ((e.key === 'Enter' || e.key === 'Backspace') && !isComposing) {
            // 如果是组合输入刚结束后的首次键盘事件
            if (isFirstKeyAfterComposition.current) {
                console.log(`检测到组合输入后的首次键盘操作: ${e.key}`);
                // 重置首次键盘事件标志
                isFirstKeyAfterComposition.current = false;
                // 确保编辑器不会锁定
                isEditorLocked.current = false;
                // 不阻止默认行为，允许键盘操作正常工作
                return;
            }
            
            // 如果是中文输入法下输入英文的情况
            if (compositionType.current === 'english') {
                console.log(`检测到中文输入法下输入英文后的键盘操作: ${e.key}`);
                // 确保编辑器不会锁定
                isEditorLocked.current = false;
                // 不阻止默认行为，允许键盘操作正常工作
                return;
            }
        }
        
        // 如果编辑器状态被锁定，且按下的是Enter或Backspace，则阻止默认行为
        if (isEditorLocked.current && (e.key === 'Enter' || e.key === 'Backspace')) {
            console.log(`编辑器锁定中，阻止键: ${e.key}`);
            
            // 如果是组合输入刚结束后的首次键盘事件
            if (isFirstKeyAfterComposition.current) {
                console.log('检测到刚刚完成组合输入，允许键盘操作');
                isFirstKeyAfterComposition.current = false;
                isEditorLocked.current = false;
                return; // 允许事件继续传播
            }
            
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        
        // 如果在组合输入状态下按下特殊字符
        if (isComposing && specialChars.includes(e.key)) {
            console.log(`组合输入中检测到特殊字符: ${e.key}`);
            // 阻止默认行为
            e.preventDefault();
            e.stopPropagation();
            
            // 将特殊字符添加到待处理字符串
            pendingChars.current += e.key;
            
            // 如果是斜杠命令，立即在编辑器中显示一个占位符，以便用户知道命令已被捕获
            if (e.key === '/' && editorEl.current && editorEl.current.view) {
                // 在编辑器中显示视觉反馈，但不实际插入字符
                const { state } = editorEl.current.view;
                const { selection } = state;
                
                // 在当前位置显示一个闪烁的光标，提示用户命令已被捕获
                editorEl.current.view.dispatch(state.tr.setSelection(selection));
            }
            return;
        }
        
        // 处理组合输入期间的格式化键，防止意外触发Markdown格式化
        if (isComposing && (e.key === 'Enter' || e.key === 'Tab' || e.key === 'Backspace')) {
            console.log(`组合输入中检测到格式键: ${e.key}`);
            
            // 对于退格键，需要特殊处理，允许删除待处理的特殊字符
            if (e.key === 'Backspace' && pendingChars.current.length > 0) {
                pendingChars.current = pendingChars.current.slice(0, -1);
                console.log(`删除待处理字符，剩余: ${pendingChars.current}`);
            } else {
                // 对于其他格式键，阻止默认行为
                e.preventDefault();
                e.stopPropagation();
            }
            return;
        }
        
        // 处理中文输入法下的斜杠键
        if (!isComposing && e.key === '/' && e.nativeEvent && e.nativeEvent.isComposing) {
            console.log('检测到中文输入法下的斜杠键');
            e.preventDefault();
            e.stopPropagation();
            
            // 立即插入斜杠，确保不会被输入法干扰
            if (editorEl.current && editorEl.current.view) {
                const { state } = editorEl.current.view;
                editorEl.current.view.dispatch(state.tr.insertText('/'));
                
                // 确保编辑器不会被锁定
                isEditorLocked.current = false;
                
                // 强制刷新编辑器状态，确保后续操作可以执行
                setTimeout(() => {
                    if (editorEl.current && editorEl.current.view) {
                        editorEl.current.view.dispatch(editorEl.current.view.state.tr);
                    }
                }, 10);
            }
            return;
        }
        
        // 如果不是组合输入状态，重置组合输入类型
        if (!isComposing && !isFirstKeyAfterComposition.current) {
            compositionType.current = null;
        }
    }, [isComposing, editorEl]);

    // 自定义onChange处理，确保在组合输入期间不会打断输入
    const handleEditorChange = useCallback(
        (value: () => string) => {
            // 如果正在组合输入，不立即触发onChange
            if (isComposing) {
                console.log('组合输入中，延迟处理onChange');
                return;
            }
            
            // 如果需要处理特殊字符，不立即触发onChange
            if (needsSpecialCharHandling.current) {
                console.log('需要处理特殊字符，延迟处理onChange');
                setTimeout(() => {
                    onEditorChange(value);
                }, 10); // 减少延迟时间
                return;
            }
            
            // 否则正常处理onChange
            onEditorChange(value);
        },
        [isComposing, onEditorChange]
    );
    
    return (
        <>
            <div 
                onKeyDown={handleKeyDown}
                onCompositionStart={handleCompositionStart}
                onCompositionUpdate={handleCompositionUpdate}
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
