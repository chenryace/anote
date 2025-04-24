import { FC, useEffect, useState, useCallback, KeyboardEvent as ReactKeyboardEvent, useRef } from 'react';
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
    
    // 状态管理
    const [isComposing, setIsComposing] = useState(false);
    const compositionStartTime = useRef(0);
    const lastCompositionEndTime = useRef(0);
    const pendingChars = useRef("");
    const isEditorLocked = useRef(false);
    const lastInputValue = useRef("");
    const inputMethodState = useRef<'chinese' | 'english'>('english');

    useEffect(() => {
        if (isPreview) return;
        setHasMinHeight((backlinks?.length ?? 0) <= 0);
    }, [backlinks, isPreview]);

    // 添加输入法状态监听
    useEffect(() => {
        const handleInputMethodChange = (e: InputEvent) => {
            inputMethodState.current = e.inputType === 'insertCompositionText' ? 'chinese' : 'english';
        };

        if (editorEl.current) {
            editorEl.current.addEventListener('inputmethodchange', handleInputMethodChange as EventListener);
        }

        return () => {
            if (editorEl.current) {
                editorEl.current.removeEventListener('inputmethodchange', handleInputMethodChange as EventListener);
            }
        };
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

    // 修改Markdown命令处理
    const handleMarkdownCommand = useCallback((command: string) => {
        if (!editorEl.current || !editorEl.current.view) return;
        
        const { state } = editorEl.current.view;
        const { from, to } = state.selection;
        
        // 检查是否在组合输入状态
        if (isComposing) {
            // 如果是组合输入状态，将命令保存到pendingChars
            pendingChars.current = command;
            return;
        }
        
        // 处理特殊命令
        if (command === '/') {
            // 触发命令菜单
            editorEl.current.view.dispatch(
                state.tr
                    .delete(from, to)
                    .insertText('/', from)
            );
            // 确保命令菜单显示
            requestAnimationFrame(() => {
                if (editorEl.current && editorEl.current.view) {
                    const { state } = editorEl.current.view;
                    editorEl.current.view.dispatch(state.tr);
                }
            });
            return;
        }
        
        // 处理其他Markdown命令
        editorEl.current.view.dispatch(
            state.tr
                .delete(from, to)
                .insertText(command, from)
        );
        
        // 确保编辑器状态正确
        requestAnimationFrame(() => {
            if (editorEl.current && editorEl.current.view) {
                const { state } = editorEl.current.view;
                editorEl.current.view.dispatch(state.tr);
            }
        });
    }, [editorEl, isComposing]);

    // 修改组合输入开始处理
    const handleCompositionStart = useCallback(() => {
        setIsComposing(true);
        compositionStartTime.current = Date.now();
        pendingChars.current = "";
        isEditorLocked.current = false;
        
        // 保存当前光标位置的内容
        if (editorEl.current && editorEl.current.view) {
            const { state } = editorEl.current.view;
            const { from, to } = state.selection;
            lastInputValue.current = state.doc.textBetween(from, to);
        }
    }, [editorEl]);

    // 修改组合输入结束处理
    const handleCompositionEnd = useCallback(() => {
        const now = Date.now();
        lastCompositionEndTime.current = now;
        
        // 如果输入时间过短（<100ms），可能是误触，不处理
        if (now - compositionStartTime.current < 100) {
            return;
        }
        
        setIsComposing(false);
        isEditorLocked.current = false;
        
        // 获取当前输入值
        let currentValue = "";
        if (editorEl.current && editorEl.current.view) {
            const { state } = editorEl.current.view;
            const { from, to } = state.selection;
            currentValue = state.doc.textBetween(from, to);
        }
        
        // 检查是否有重复输入
        if (currentValue.includes(lastInputValue.current) && 
            currentValue.length > lastInputValue.current.length) {
            // 如果检测到重复输入，只保留新输入的内容
            if (editorEl.current && editorEl.current.view) {
                const { state } = editorEl.current.view;
                const { from, to } = state.selection;
                const newContent = currentValue.slice(lastInputValue.current.length);
                editorEl.current.view.dispatch(
                    state.tr
                        .delete(from, to)
                        .insertText(newContent, from)
                );
                currentValue = newContent;
            }
        }
        
        // 更新最后一次输入值
        lastInputValue.current = currentValue;
        
        // 处理待处理的特殊字符
        if (pendingChars.current) {
            // 如果是斜杠命令，特殊处理
            if (pendingChars.current === '/' && inputMethodState.current === 'chinese') {
                handleMarkdownCommand('/');
            } else {
                handleMarkdownCommand(pendingChars.current);
            }
            pendingChars.current = "";
        }
        
        // 触发编辑器变化
        handleEditorChange();
    }, [editorEl, handleMarkdownCommand, handleEditorChange]);

    // 修改键盘事件处理
    const handleKeyDown = useCallback((e: ReactKeyboardEvent) => {
        const specialChars = ['/', '#', '*', '>', '`', '-', '+', '=', '[', ']', '(', ')', '!', '@'];
        
        // 处理特殊字符
        if (specialChars.includes(e.key)) {
            if (isComposing) {
                // 在中文输入法下，特殊处理斜杠
                if (e.key === '/' && inputMethodState.current === 'chinese') {
                    e.preventDefault();
                    handleMarkdownCommand('/');
                    return;
                }
                pendingChars.current = e.key;
                return;
            }
            e.preventDefault();
            handleMarkdownCommand(e.key);
        }
        
        // 处理数字选择
        if (isComposing && /^[1-9]$/.test(e.key)) {
            e.preventDefault();
            // 让输入法处理数字选择
            return;
        }
    }, [isComposing, handleMarkdownCommand]);

    // 设置编辑器事件监听
    useEffect(() => {
        if (!editorEl.current || isPreview || readOnly) return;

        const editorDom = editorEl.current.element;
        if (!editorDom) return;

        // 添加事件监听
        editorDom.addEventListener('compositionstart', handleCompositionStart);
        editorDom.addEventListener('compositionend', handleCompositionEnd);

        return () => {
            editorDom.removeEventListener('compositionstart', handleCompositionStart);
            editorDom.removeEventListener('compositionend', handleCompositionEnd);
        };
    }, [editorEl, isPreview, readOnly, handleCompositionStart, handleCompositionEnd]);

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
