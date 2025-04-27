import { useRouter } from 'next/router';
import {
    useCallback,
    MouseEvent as ReactMouseEvent,
    useState,
    useRef,
    useEffect,
} from 'react';
import { searchNote, searchRangeText } from 'libs/web/utils/search';
import useFetcher from 'libs/web/api/fetcher';
import { NOTE_DELETED } from 'libs/shared/meta';
import { isNoteLink, NoteModel } from 'libs/shared/note';
import { useToast } from 'libs/web/hooks/use-toast';
import PortalState from 'libs/web/state/portal';
import { NoteCacheItem } from 'libs/web/cache';
import noteCache from 'libs/web/cache/note';
import { createContainer } from 'unstated-next';
import MarkdownEditor from '@notea/rich-markdown-editor';
import { useDebouncedCallback } from 'use-debounce';
import { ROOT_ID } from 'libs/shared/tree';
import { has } from 'lodash';
import UIState from './ui';
import NoteTreeState from './tree';
import NoteState from './note';
import localStorageService from 'libs/web/storage/local-storage-service';

const onSearchLink = async (keyword: string) => {
    const list = await searchNote(keyword, NOTE_DELETED.NORMAL);

    return list.map((item) => ({
        title: item.title,
        // todo 路径
        subtitle: searchRangeText({
            text: item.rawContent || '',
            keyword,
            maxLen: 40,
        }).match,
        url: `/${item.id}`,
    }));
};

const useEditor = (initNote?: NoteModel) => {
    const {
        createNoteWithTitle,
        updateNote,
        createNote,
        note: noteProp,
    } = NoteState.useContainer();
    const note = initNote ?? noteProp;
    const {
        ua: { isBrowser },
    } = UIState.useContainer();
    const router = useRouter();
    const { request, error } = useFetcher();
    const toast = useToast();
    const editorEl = useRef<MarkdownEditor>(null);
    const treeState = NoteTreeState.useContainer();
    
    // 添加本地更改状态
    const [hasLocalChanges, setHasLocalChanges] = useState<boolean>(false);
    const [localContent, setLocalContent] = useState<string>('');
    const [localTitle, setLocalTitle] = useState<string>('');
    const [isSaving, setIsSaving] = useState<boolean>(false);
    
    // 添加编辑器渲染状态
    const [editorKey, setEditorKey] = useState<number>(0);
    
    // 初始化本地内容，优化缓存处理
    useEffect(() => {
        if (note) {
            console.log('初始化编辑器内容', { id: note.id, content: note.content });
            
            // 检查localStorage中是否有未保存的内容
            const loadLocalData = async () => {
                if (note.id) {
                    try {
                        const localData = await localStorageService.getNote(note.id);
                        
                        if (localData) {
                            // 如果本地有数据，使用本地数据
                            setLocalContent(localData.content || '');
                            setLocalTitle(localData.title || '');
                            setHasLocalChanges(true);
                            console.log('从localStorage恢复未保存内容', { noteId: note.id });
                        } else {
                            // 否则使用服务器数据
                            setLocalContent(note.content || '');
                            setLocalTitle(note.title || '');
                            setHasLocalChanges(false);
                        }
                    } catch (error) {
                        console.error('从localStorage加载数据失败', error);
                        // 出错时使用服务器数据
                        setLocalContent(note.content || '');
                        setLocalTitle(note.title || '');
                        setHasLocalChanges(false);
                    }
                } else {
                    // 新笔记，使用服务器数据
                    setLocalContent(note.content || '');
                    setLocalTitle(note.title || '');
                    setHasLocalChanges(false);
                }
                
                // 移除强制重新渲染，避免光标跳动问题
                // setEditorKey(prev => prev + 1);
            };
            
            loadLocalData();
        }
    }, [note?.id]); // 只在笔记ID变化时重新加载，而不是笔记内容变化时
    
    // 定期清理过期的localStorage数据
    useEffect(() => {
        const cleanupInterval = setInterval(async () => {
            try {
                // 获取所有笔记
                const notes = await localStorageService.getUnsyncedNotes();
                
                // 找出超过7天未修改的笔记
                const now = Date.now();
                const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
                
                for (const note of notes) {
                    if (note.lastModified < sevenDaysAgo) {
                        console.log('清除过期笔记', note.id);
                        await localStorageService.deleteNote(note.id);
                    }
                }
            } catch (error) {
                console.error('清理过期数据失败', error);
            }
        }, 24 * 60 * 60 * 1000); // 每24小时执行一次
        
        return () => clearInterval(cleanupInterval);
    }, []);

    const onNoteChange = useDebouncedCallback(
        async (data: Partial<NoteModel>) => {
            const isNew = has(router.query, 'new');

            if (isNew) {
                data.pid = (router.query.pid as string) || ROOT_ID;
                const item = await createNote({ ...note, ...data });
                const noteUrl = `/${item?.id}`;

                if (router.asPath !== noteUrl) {
                    await router.replace(noteUrl, undefined, { shallow: true });
                }
            } else {
                await updateNote(data);
            }
        },
        500
    );

    const onCreateLink = useCallback(
        async (title: string) => {
            const result = await createNoteWithTitle(title);

            if (!result) {
                throw new Error('todo');
            }

            return `/${result.id}`;
        },
        [createNoteWithTitle]
    );

    const onClickLink = useCallback(
        (href: string) => {
            if (isNoteLink(href.replace(location.origin, ''))) {
                router.push(href, undefined, { shallow: true })
                    .catch((v) => console.error('Error whilst pushing href to router: %O', v));
            } else {
                window.open(href, '_blank');
            }
        },
        [router]
    );

    const onUploadImage = useCallback(
        async (file: File, id?: string) => {
            const data = new FormData();
            data.append('file', file);
            const result = await request<FormData, { url: string }>(
                {
                    method: 'POST',
                    url: `/api/upload?id=${id}`,
                },
                data
            );
            if (!result) {
                toast(error, 'error');
                throw Error(error);
            }
            return result.url;
        },
        [error, request, toast]
    );

    const { preview, linkToolbar } = PortalState.useContainer();

    const onHoverLink = useCallback(
        (event: MouseEvent | ReactMouseEvent) => {
            if (!isBrowser || editorEl.current?.props.readOnly) {
                return true;
            }
            const link = event.target as HTMLLinkElement;
            const href = link.getAttribute('href');
            if (link.classList.contains('bookmark')) {
                return true;
            }
            if (href) {
                if (isNoteLink(href)) {
                    preview.close();
                    preview.setData({ id: href.slice(1) });
                    preview.setAnchor(link);
                } else {
                    linkToolbar.setData({ href, view: editorEl.current?.view });
                    linkToolbar.setAnchor(link);
                }
            } else {
                preview.setData({ id: undefined });
            }
            return true;
        },
        [isBrowser, preview, linkToolbar]
    );

    const [backlinks, setBackLinks] = useState<NoteCacheItem[]>();

    const getBackLinks = useCallback(async () => {
        console.log('获取反向链接', note?.id);
        const linkNotes: NoteCacheItem[] = [];
        if (!note?.id) return linkNotes;
        setBackLinks([]);
        await noteCache.iterate<NoteCacheItem, void>((value) => {
            if (value.linkIds?.includes(note.id)) {
                linkNotes.push(value);
            }
        });
        setBackLinks(linkNotes);
    }, [note?.id]);

    // 使用防抖处理编辑器内容变更，避免频繁保存
    const debouncedSaveToLocalStorage = useDebouncedCallback(
        async (noteId: string, content?: string, title?: string) => {
            if (!noteId) return;
            
            try {
                await localStorageService.saveNote(noteId, content, title);
            } catch (error) {
                console.error('保存到localStorage失败', error);
            }
        },
        500 // 500毫秒防抖延迟
    );
    
    // 优化编辑器内容变更处理
    const onEditorChange = useCallback(
        (getValue: () => string) => {
            if (isSaving) return; // 如果正在保存，则忽略更改

            const content = getValue();
            const title = extractTitleFromContent(content);

            // 立即更新本地状态以反映更改
            setLocalContent(content);
            setLocalTitle(title);
            setHasLocalChanges(true);

            // 立即将更改保存到localStorage
            if (note?.id) {
                localStorageService.saveNote(note.id, { content, title, lastModified: Date.now() });
            }

            // 触发防抖保存到后端
            onNoteChange({ content, title });
        },
        [note?.id, onNoteChange, isSaving] // 包含 isSaving 依赖
    );
    
    // 优化标题变更处理
    const onTitleChange = useCallback(
        (title: string): void => {
            console.log('标题变更', { title });
            
            // 更新本地状态
            setLocalTitle(title);
            setHasLocalChanges(true);
            
            // 使用防抖保存到localStorage
            if (note?.id) {
                debouncedSaveToLocalStorage.callback(note.id, localContent, title);
            }
        },
        [note, localContent, debouncedSaveToLocalStorage]
    );
    
    // 优化手动保存函数，确保更新元数据和树结构
    const saveNote = useCallback(async () => {
        if (!note?.id) return false;
        if (isSaving) return false; // 防止重复保存
        
        try {
            setIsSaving(true);
            console.log('保存笔记', { id: note?.id, localContent, localTitle });
            
            // 对于新笔记的特殊处理
            const isNew = has(router.query, 'new');
            if (isNew) {
                // 确保包含必要的元数据，特别是日期和pid
                const data = {
                    content: localContent,
                    title: localTitle,
                    pid: (router.query.pid as string) || ROOT_ID,
                    date: new Date().toISOString() // 添加日期元数据
                };
                
                console.log('创建新笔记', data);
                const item = await createNote({ ...note, ...data });
                const noteUrl = `/${item?.id}`;
                
                if (router.asPath !== noteUrl) {
                    await router.replace(noteUrl, undefined, { shallow: true });
                }
            } else {
                // 保存现有笔记，确保包含日期元数据
                console.log('更新现有笔记', { content: localContent, title: localTitle });
                await updateNote({
                    content: localContent,
                    title: localTitle,
                    date: new Date().toISOString() // 添加日期元数据
                });
            }
            
            // 清除本地更改标记
            setHasLocalChanges(false);
            
            // 清除localStorage中的笔记数据
            if (note.id) {
                await localStorageService.deleteNote(note.id);
            }
            
            // 保存成功后，刷新树结构以确保侧栏正确显示
            if (treeState && typeof treeState.initTree === 'function') {
                console.log('刷新树结构');
                await treeState.initTree();
            }
            
            // 移除强制重新渲染，避免光标位置丢失
            // 保存操作不应该影响编辑器的渲染状态
            
            // 显示保存成功提示
            toast('保存成功', 'success');
            
            return true;
        } catch (error) {
            console.error('保存失败', error);
            toast('保存失败，请重试', 'error');
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [note, localContent, localTitle, updateNote, createNote, router, toast, treeState, isSaving]);
    
    // 优化带重试的保存函数
    const saveNoteWithRetry = useCallback(async (retryCount = 3) => {
        if (isSaving) return false; // 防止重复保存
        
        for (let i = 0; i < retryCount; i++) {
            try {
                const result = await saveNote();
                if (result) return true;
            } catch (error) {
                console.error(`保存失败，尝试重试 (${i+1}/${retryCount})`, error);
                if (i === retryCount - 1) {
                    toast('保存失败，请手动刷新页面后重试', 'error');
                    return false;
                }
                // 等待一段时间后重试
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        return false;
    }, [saveNote, toast, isSaving]);
    
    // 优化丢弃更改函数
    const discardChanges = useCallback(() => {
        if (!note) return;
        
        console.log('丢弃更改', { id: note.id });
        
        // 恢复到原始内容
        setLocalContent(note.content || '');
        setLocalTitle(note.title || '');
        setHasLocalChanges(false);
        
        // 清除localStorage
        if (note.id) {
            localStorageService.deleteNote(note.id)
                .catch(error => console.error('清除localStorage失败', error));
        }
        
        // 移除强制重新渲染，避免光标跳动
        // setEditorKey(prev => prev + 1);
        
        toast('已丢弃更改', 'info');
    }, [note, toast]);
    
    // 添加强制重新渲染函数
    const forceRender = useCallback(() => {
        console.log('强制编辑器重新渲染');
        setEditorKey(prev => prev + 1);
    }, []);

    return {
        onCreateLink,
        onSearchLink,
        onClickLink,
        onUploadImage,
        onHoverLink,
        getBackLinks,
        onEditorChange,
        onNoteChange,
        backlinks,
        editorEl,
        note,
        // 新增的手动保存相关函数和状态
        saveNote,
        saveNoteWithRetry,
        discardChanges,
        hasLocalChanges,
        localContent,
        localTitle,
        onTitleChange,
        // 编辑器渲染相关
        editorKey,
        forceRender
    };
};

const EditorState = createContainer(useEditor);

export default EditorState;
