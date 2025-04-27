import { FC, useCallback, useEffect, useState } from 'react';
import { use100vh } from 'react-div-100vh';
import useMounted from 'libs/web/hooks/use-mounted';
import { useToast } from 'libs/web/hooks/use-toast';
import EditorState from 'libs/web/state/editor';
import { useMarkdownEditor, MarkdownEditorView } from '@gravity-ui/markdown-editor';
import '@gravity-ui/markdown-editor/dist/index.css';
import { configure } from '@gravity-ui/markdown-editor';
import { useGravityTheme as useEditorTheme } from './theme-adapter';
import { useDictionary } from './dictionary';

export interface EditorProps {
    readOnly?: boolean;
    isPreview?: boolean;
}

const Editor: FC<EditorProps> = ({ readOnly, isPreview }) => {
    // 初始化编辑器配置
    // 初始化编辑器配置
    useEffect(() => {
        // Gravity UI只支持'ru'、'en'或undefined作为语言选项
        configure({
            lang: 'en'
        });
    }, []);
    const {
        onClickLink,
        onUploadImage,
        onHoverLink,
        onEditorChange,
        backlinks,
        editorEl,
        note,
        localContent,
        editorKey,
    } = EditorState.useContainer();
    const height = use100vh();
    const mounted = useMounted();
    // 使用编辑器主题
    const editorTheme = useEditorTheme();
    const [hasMinHeight, setHasMinHeight] = useState(true);
    const toast = useToast();
    const dictionary = useDictionary();
    
    // 初始化时设置最小高度
    useEffect(() => {
        if (isPreview) return;
        setHasMinHeight((backlinks?.length ?? 0) <= 0);
    }, [backlinks, isPreview]);
    
    // 创建编辑器实例
    const editor = useMarkdownEditor({
        allowHTML: true,
        autoFocus: !readOnly,
        placeholder: dictionary.editorPlaceholder,
        theme: editorTheme === 'dark' ? 'dark' : 'light',
    });
    
    // 将编辑器实例保存到ref中
    useEffect(() => {
        if (editor && editorEl) {
            editorEl.current = editor;
        }
    }, [editor, editorEl]);
    
    // 设置编辑器初始内容
    useEffect(() => {
        if (editor && mounted && localContent) {
            editor.setValue(localContent);
        }
    }, [editor, mounted, localContent, editorKey]);
    
    // 处理编辑器内容变化
    useEffect(() => {
        if (!editor) return;
        
        const handleChange = () => {
            const value = editor.getValue();
            onEditorChange(() => value);
        };
        
        editor.on('change', handleChange);
        return () => {
            editor.off('change', handleChange);
        };
    }, [editor, onEditorChange]);
    
    // 处理图片上传
    const handleImageUpload = useCallback(async (file: File) => {
        try {
            const url = await onUploadImage(file, note?.id);
            return url;
        } catch (error) {
            console.error('图片上传失败', error);
            toast('图片上传失败', 'error');
            return null;
        }
    }, [note?.id, onUploadImage, toast]);
    
    // 处理链接点击
    const handleLinkClick = useCallback((href: string, event: React.MouseEvent) => {
        event.preventDefault();
        onClickLink(href);
    }, [onClickLink]);
    
    // 处理链接悬停
    const handleLinkHover = useCallback((event: React.MouseEvent) => {
        onHoverLink(event);
    }, [onHoverLink]);
    
    // 根据编辑状态决定是否显示工具栏
    const [isEditing, setIsEditing] = useState(false);
    
    // 监听编辑器焦点状态
    useEffect(() => {
        if (!editor || readOnly) return;
        
        const handleFocus = () => setIsEditing(true);
        const handleBlur = () => setIsEditing(false);
        
        editor.on('focus', handleFocus);
        editor.on('blur', handleBlur);
        
        return () => {
            editor.off('focus', handleFocus);
            editor.off('blur', handleBlur);
        };
    }, [editor, readOnly]);
    
    // 工具栏配置在MarkdownEditorView组件中自动处理

    // 如果编辑器未初始化，显示加载状态
    if (!editor) {
        return <div className="p-4">加载编辑器中...</div>;
    }
    
    return (
        <>
            <div key={editorKey} className="markdown-editor-container">
                <MarkdownEditorView
                    editor={editor}
                    stickyToolbar
                    uploadImage={handleImageUpload}
                    onLinkClick={handleLinkClick}
                    onLinkHover={handleLinkHover}
                    className={`px-4 md:px-0 ${readOnly || (!isEditing && !isPreview) ? 'toolbar-hidden' : ''}`}
                    readOnly={readOnly}
                />
            </div>
            <style jsx global>{`
                .markdown-editor-container {
                    ${hasMinHeight
                        ? `min-height: calc(${
                              height ? height + 'px' : '100vh'
                          } - 14rem);`
                        : ''}
                }
                
                .markdown-editor-container .g-markdown-editor {
                    border: none;
                    background: transparent;
                }
                
                .markdown-editor-container .g-markdown-editor__toolbar {
                    position: sticky;
                    top: 0;
                    z-index: 10;
                    background: var(--g-color-base-background);
                    border-bottom: 1px solid var(--g-color-line-generic);
                    padding: 8px 0;
                    transition: opacity 0.3s ease, transform 0.3s ease;
                }
                
                .markdown-editor-container.toolbar-hidden .g-markdown-editor__toolbar,
                .toolbar-hidden .g-markdown-editor__toolbar {
                    opacity: 0;
                    transform: translateY(-100%);
                    pointer-events: none;
                }
                
                .markdown-editor-container .g-markdown-editor__content {
                    padding-bottom: 10rem;
                }
                
                .markdown-editor-container h1 {
                    font-size: 2.8em;
                }
                
                .markdown-editor-container h2 {
                    font-size: 1.8em;
                }
                
                .markdown-editor-container h3 {
                    font-size: 1.5em;
                }
                
                .markdown-editor-container a:not(.bookmark) {
                    text-decoration: underline;
                }
            `}</style>
        </>
    );
};

export default Editor;
