import { FC, useEffect, useState } from 'react';
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
import useI18n from 'libs/web/hooks/use-i18n';
import classNames from 'classnames';

export interface EditorProps extends Pick<Props, 'readOnly'> {
    isPreview?: boolean;
}

// 定义保存状态类型
type SaveStatus = 'unsaved' | 'saving' | 'uploading' | 'verifying' | 'saved' | 'error';

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
        hasLocalChanges,
        localContent,
        saveNote,
        editorKey,
    } = EditorState.useContainer();
    const height = use100vh();
    const mounted = useMounted();
    const editorTheme = useEditorTheme();
    const [hasMinHeight, setHasMinHeight] = useState(true);
    const toast = useToast();
    const dictionary = useDictionary();
    const embeds = useEmbeds();
    const { t } = useI18n();
    
    // 添加保存状态管理
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
    
    // 监听本地更改状态
    useEffect(() => {
        if (hasLocalChanges) {
            setSaveStatus('unsaved');
        }
    }, [hasLocalChanges]);
    
    // 处理保存操作
    const handleSave = async () => {
        if (!hasLocalChanges || saveStatus === 'saving' || saveStatus === 'uploading' || saveStatus === 'verifying') {
            return;
        }
        
        try {
            // 更新保存状态：保存中
            setSaveStatus('saving');
            await new Promise(resolve => setTimeout(resolve, 100)); // 短暂延迟以显示状态
            
            // 更新保存状态：上传中
            setSaveStatus('uploading');
            await new Promise(resolve => setTimeout(resolve, 100)); // 短暂延迟以显示状态
            
            // 更新保存状态：对账中
            setSaveStatus('verifying');
            
            // 执行实际保存操作 - 使用EditorState中的saveNote函数
            const result = await saveNote();
            
            // 根据保存结果更新状态
            if (result) {
                setSaveStatus('saved');
                // 3秒后清除保存状态显示
                setTimeout(() => {
                    setSaveStatus(hasLocalChanges ? 'unsaved' : 'saved');
                }, 3000);
            } else {
                setSaveStatus('error');
                toast(t('保存失败，请重试'), 'error');
            }
        } catch (error) {
            console.error('保存失败', error);
            setSaveStatus('error');
            toast(t('保存失败，请重试'), 'error');
        }
    };
    
    // 监听自定义保存事件
    useEffect(() => {
        const articleElement = document.querySelector('article');
        if (!articleElement) return;
        
        const handleSaveEvent = () => {
            if (hasLocalChanges) {
                handleSave();
            }
        };
        
        articleElement.addEventListener('editor-save-note', handleSaveEvent);
        return () => articleElement.removeEventListener('editor-save-note', handleSaveEvent);
    }, [hasLocalChanges, handleSave]);
    
    // 注意：Ctrl+S快捷键和页面离开提示已移至main-editor.tsx中处理，避免重复绑定事件
    
    // 设置编辑器最小高度
    useEffect(() => {
        if (isPreview) return;
        setHasMinHeight((backlinks?.length ?? 0) <= 0);
    }, [backlinks, isPreview]);
    
    // 渲染保存状态指示器
    const renderSaveStatus = () => {
        if (readOnly || isPreview) return null;
        
        // 状态文本和样式映射
        const statusConfig = {
            unsaved: { text: t('未保存'), className: 'text-red-500 animate-pulse' },
            saving: { text: t('保存中...'), className: 'text-yellow-500' },
            uploading: { text: t('上传中...'), className: 'text-yellow-500' },
            verifying: { text: t('对账中...'), className: 'text-yellow-500' },
            saved: { text: t('已保存'), className: 'text-green-500' },
            error: { text: t('保存失败'), className: 'text-red-500' },
        };
        
        const config = statusConfig[saveStatus];
        
        return (
            <div className="fixed bottom-4 right-4 z-50">
                <div className={classNames(
                    "px-3 py-2 rounded-md shadow-md bg-white dark:bg-gray-800 flex items-center",
                    saveStatus === 'saved' ? 'opacity-70' : 'opacity-90'
                )}>
                    <span className={classNames("text-sm font-medium", config.className)}>
                        {config.text}
                    </span>
                    {(saveStatus === 'unsaved' || saveStatus === 'error') && (
                        <button 
                            onClick={handleSave}
                            className="ml-2 text-blue-500 text-sm hover:text-blue-700 focus:outline-none"
                        >
                            {t('保存')}
                        </button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <>
            <MarkdownEditor
                readOnly={readOnly}
                id={note?.id}
                ref={editorEl}
                value={mounted ? localContent || note?.content || '' : ''}
                onChange={onEditorChange}
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
                key={editorKey} // 添加key以支持强制重新渲染
            />
            {renderSaveStatus()}
            <style jsx global>{`
                .ProseMirror ul {
                    list-style-type: disc;
                }
                .ProseMirror ol {
                    list-style-type: decimal;
                }
                .ProseMirror {
                    min-height: ${hasMinHeight ? height ? height - 320 : 500 : 0}px;
                    padding-bottom: 160px;
                }
                .ProseMirror:focus {
                    outline: none;
                }
                .ProseMirror hr {
                    visibility: visible;
                }
                .ProseMirror hr:after {
                    content: none;
                }
                .ProseMirror img {
                    max-width: 100%;
                }
                .ProseMirror .image {
                    text-align: center;
                }
                .ProseMirror .image.placeholder {
                    position: relative;
                    background-color: var(--placeholder-color);
                }
                .ProseMirror .image .caption-input {
                    margin-top: 0.5em;
                }
                .ProseMirror .image.align-start {
                    float: left;
                    margin-right: 1.5em;
                    margin-bottom: 1em;
                    margin-top: 0.5em;
                    max-width: 50%;
                }
                .ProseMirror .image.align-end {
                    float: right;
                    margin-left: 1.5em;
                    margin-bottom: 1em;
                    margin-top: 0.5em;
                    max-width: 50%;
                }
                .ProseMirror .image.align-wide {
                    width: 100%;
                    max-width: 1024px;
                    margin-left: auto;
                    margin-right: auto;
                }
                .ProseMirror .image.align-wide img {
                    max-width: 100%;
                }
                .ProseMirror .image.align-wide .caption {
                    text-align: center;
                }
                .ProseMirror .image.align-full {
                    width: 100vw;
                    max-width: 100vw;
                    margin-left: calc(50% - 50vw);
                    margin-right: calc(50% - 50vw);
                }
                .ProseMirror .image.align-full img {
                    max-width: 100%;
                }
                .ProseMirror .image.align-full .caption {
                    text-align: center;
                    margin-left: calc(50% - 50vw);
                    margin-right: calc(50% - 50vw);
                    max-width: 1024px;
                    margin: 0 auto;
                }
            `}</style>
        </>
    );
};

export default Editor;
