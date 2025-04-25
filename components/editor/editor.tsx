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
    const isEditorLocked = useRef(false);
    const lastInputValue = useRef("");

    useEffect(() => {
        if (isPreview) return;
        setHasMinHeight((backlinks?.length ?? 0) <= 0);
    }, [backlinks, isPreview]);

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
    const handleCompositionStart = useCallback(() => {
        setIsComposing(true);
        isEditorLocked.current = true;
        
        // 保存当前光标位置的内容
        if (editorEl.current && editorEl.current.view) {
            const { state } = editorEl.current.view;
            const { from, to } = state.selection;
            lastInputValue.current = state.doc.textBetween(from, to);
        }
    }, [editorEl]);

    // 修改组合输入结束处理
    const handleCompositionEnd = useCallback(() => {
        setIsComposing(false);
        isEditorLocked.current = false;  // 确保在组合输入结束后解锁编辑器
        
        // 获取当前输入值
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
        }
        
        // 触发编辑器变化
        handleEditorChange();
    }, [editorEl, handleEditorChange]);

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
        // 处理可能结束组合输入的按键
        if (isComposing && (e.key === 'Enter' || e.key === 'Shift' || /^[1-9]$/.test(e.key))) {
            composed();
            return; // 让编辑器处理这些按键
        }

        // 如果编辑器被锁定，只处理数字键
        if (isEditorLocked.current) {
            if (/^[1-9]$/.test(e.key)) {
                composed(); // 数字键也会结束组合输入
                return;
            }
            // 在组合输入期间，允许方向键和删除键
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Backspace', 'Delete'].includes(e.key)) {
                return;
            }
            e.preventDefault();
            return;
        }
        
        // 处理特殊字符
        const specialChars = ['/', '#', '*', '>', '`', '-', '+', '=', '[', ']', '(', ')', '!', '@'];
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
    }, [editorEl, isComposing, composed]);

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
