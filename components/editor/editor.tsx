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
    
    // 简化状态管理
    const [isComposing, setIsComposing] = useState(false);
    const lastCompositionEndTime = useRef<number>(0);
    const compositionStartTime = useRef<number>(0);
    const pendingChars = useRef<string>("");
    const isEditorLocked = useRef<boolean>(false);

    useEffect(() => {
        if (isPreview) return;
        setHasMinHeight((backlinks?.length ?? 0) <= 0);
    }, [backlinks, isPreview]);

    // 处理Markdown命令
    const handleMarkdownCommand = useCallback((command: string) => {
        if (!editorEl.current || !editorEl.current.view) return;
        
        const { state } = editorEl.current.view;
        editorEl.current.view.dispatch(state.tr.insertText(command));
    }, [editorEl]);

    // 组合输入开始处理
    const handleCompositionStart = useCallback(() => {
        setIsComposing(true);
        compositionStartTime.current = Date.now();
        pendingChars.current = "";
        isEditorLocked.current = false; // 开始输入时解锁编辑器
    }, []);

    // 组合输入结束处理
    const handleCompositionEnd = useCallback(() => {
        const now = Date.now();
        lastCompositionEndTime.current = now;
        
        // 如果输入时间过短（<100ms），可能是误触，不处理
        if (now - compositionStartTime.current < 100) {
            return;
        }
        
        setIsComposing(false);
        isEditorLocked.current = false;
        
        // 处理待处理的特殊字符
        if (pendingChars.current) {
            handleMarkdownCommand(pendingChars.current);
            pendingChars.current = "";
        }
        
        // 确保编辑器状态正确
        if (editorEl.current && editorEl.current.view) {
            const { state } = editorEl.current.view;
            editorEl.current.view.dispatch(state.tr);
        }
    }, [editorEl, handleMarkdownCommand]);

    // 键盘事件处理
    const handleKeyDown = useCallback((e: ReactKeyboardEvent) => {
        const specialChars = ['/', '#', '*', '>', '`', '-', '+', '=', '[', ']', '(', ')', '!', '@'];
        
        // 处理数字键选词
        if (isComposing && e.key >= '1' && e.key <= '9') {
            return; // 让输入法处理
        }
        
        // 处理Enter键
        if (e.key === 'Enter') {
            if (isComposing) {
                return; // 让输入法处理
            }
            return; // 让编辑器处理
        }
        
        // 处理特殊字符
        if (specialChars.includes(e.key)) {
            if (isComposing) {
                pendingChars.current = e.key;
                return; // 让输入法处理
            }
            
            // 非组合状态下直接处理
            e.preventDefault();
            handleMarkdownCommand(e.key);
        }
    }, [isComposing, handleMarkdownCommand]);

    // 编辑器变化处理
    const handleEditorChange = useCallback(
        (value: () => string) => {
            if (isComposing) {
                return; // 组合输入时不处理
            }
            onEditorChange(value);
        },
        [isComposing, onEditorChange]
    );

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
