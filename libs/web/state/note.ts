import { useCallback, useState } from 'react';
import { createContainer } from 'unstated-next';
import NoteTreeState from 'libs/web/state/tree';
import { NOTE_DELETED, NOTE_PINNED, NOTE_SHARED } from 'libs/shared/meta';
import useNoteAPI from '../api/note';
import noteCache from '../cache/note';
import { NoteModel } from 'libs/shared/note';
import { useToast } from '../hooks/use-toast';
import { isEmpty, map } from 'lodash';

const useNote = (initData?: NoteModel) => {
    const [note, setNote] = useState<NoteModel | undefined>(initData);
    const { find, abort: abortFindNote } = useNoteAPI();
    const { create, error: createError } = useNoteAPI();
    const { mutate, loading, abort } = useNoteAPI();
    const { addItem, removeItem, mutateItem, genNewId, initTree } =
        NoteTreeState.useContainer();
    const toast = useToast();

    const fetchNote = useCallback(
        async (id: string) => {
            console.log('fetchNote', { id });
            const cache = await noteCache.getItem(id);
            if (cache) {
                console.log('从缓存获取笔记', cache);
                setNote(cache);
            }
            const result = await find(id);

            if (!result) {
                console.log('API获取笔记失败');
                return;
            }

            console.log('API获取笔记成功', result);
            result.content = result.content || '\n';
            setNote(result);
            await noteCache.setItem(id, result);

            return result;
        },
        [find]
    );

    const removeNote = useCallback(
        async (id: string) => {
            console.log('removeNote', { id });
            const payload = {
                deleted: NOTE_DELETED.DELETED,
            };

            setNote((prev) => {
                if (prev?.id === id) {
                    return { ...prev, ...payload };
                }
                return prev;
            });
            await mutate(id, payload);
            await noteCache.mutateItem(id, payload);
            await removeItem(id);
        },
        [mutate, removeItem]
    );

    const mutateNote = useCallback(
        async (id: string, payload: Partial<NoteModel>) => {
            console.log('mutateNote', { id, payload });
            const note = await noteCache.getItem(id);

            if (!note) {
                console.error('mutate note error: 笔记不存在');
                return;
            }

            // 确保包含日期字段
            const updatedPayload = {
                ...payload,
                date: payload.date || new Date().toISOString()
            };

            const diff: Partial<NoteModel> = {};
            map(updatedPayload, (value: any, key: keyof NoteModel) => {
                if (note[key] !== value) {
                    diff[key] = value;
                }
            });

            if (isEmpty(diff)) {
                console.log('无变更，跳过更新');
                return;
            }

            console.log('有变更，更新笔记', diff);
            setNote((prev) => {
                if (prev?.id === id) {
                    return { ...prev, ...updatedPayload };
                }
                return prev;
            });
            await mutate(id, updatedPayload);
            await noteCache.mutateItem(id, updatedPayload);
            await mutateItem(id, {
                data: {
                    ...note,
                    ...updatedPayload,
                },
            });
        },
        [mutate, mutateItem]
    );

    const createNote = useCallback(
        async (body: Partial<NoteModel>) => {
            console.log('createNote', body);
            
            // 确保包含必要的元数据
            const noteWithMeta = {
                ...body,
                date: body.date || new Date().toISOString(),
                deleted: body.deleted || NOTE_DELETED.NORMAL,
                shared: body.shared || NOTE_SHARED.PRIVATE,
                pinned: body.pinned || NOTE_PINNED.UNPINNED
            };
            
            const result = await create(noteWithMeta);

            if (!result) {
                console.error('创建笔记失败', createError);
                toast(createError, 'error');
                return;
            }

            console.log('创建笔记成功', result);
            result.content = result.content || '\n';
            await noteCache.setItem(result.id, result);
            setNote(result);
            
            // 确保添加到树结构
            console.log('添加笔记到树结构', result);
            addItem(result);
            
            // 刷新树结构
            console.log('刷新树结构');
            await initTree();

            return result;
        },
        [create, addItem, toast, createError, initTree]
    );

    const createNoteWithTitle = useCallback(
        async (title: NoteModel['title']) => {
            console.log('createNoteWithTitle', { title });
            const id = genNewId();
            const result = await create({
                id,
                title,
                date: new Date().toISOString() // 添加日期元数据
            });

            if (!result) {
                console.error('创建笔记失败');
                return;
            }

            console.log('创建笔记成功', result);
            result.content = result.content || '\n';
            await noteCache.setItem(result.id, result);
            addItem(result);
            
            // 刷新树结构
            await initTree();

            return { id };
        },
        [addItem, create, genNewId, initTree]
    );

    /**
     * TODO: merge with mutateNote
     */
    const updateNote = useCallback(
        async (data: Partial<NoteModel>) => {
            console.log('updateNote', data);
            abort();

            if (!note?.id) {
                console.error('updateNote error: 笔记ID不存在');
                toast('Not found id', 'error');
                return;
            }
            
            // 确保包含日期字段
            const updatedData = {
                ...data,
                date: data.date || new Date().toISOString()
            };
            
            const newNote = {
                ...note,
                ...updatedData,
            };
            delete newNote.content;
            setNote(newNote);
            
            console.log('更新树结构中的笔记数据', { id: newNote.id, data: newNote });
            await mutateItem(newNote.id, {
                data: newNote,
            });
            
            console.log('调用API更新笔记', { id: note.id, data: updatedData });
            await mutate(note.id, updatedData);
            
            console.log('更新笔记缓存', { id: note.id, data: updatedData });
            await noteCache.mutateItem(note.id, updatedData);
        },
        [abort, toast, note, mutate, mutateItem]
    );

    const initNote = useCallback((note: Partial<NoteModel>) => {
        console.log('initNote', note);
        setNote({
            deleted: NOTE_DELETED.NORMAL,
            shared: NOTE_SHARED.PRIVATE,
            pinned: NOTE_PINNED.UNPINNED,
            editorsize: null,
            id: '-1',
            title: '',
            ...note,
        });
    }, []);

    const findOrCreateNote = useCallback(
        async (id: string, note: Partial<NoteModel>) => {
            console.log('findOrCreateNote', { id, note });
            try {
                const data = await fetchNote(id);
                if (!data) {
                    console.log('笔记不存在，准备创建');
                    throw data;
                }
                console.log('笔记已存在', data);
            } catch (e) {
                console.log('创建笔记', { id, ...note });
                await createNote({
                    id,
                    ...note,
                    date: new Date().toISOString() // 添加日期元数据
                });
            }
        },
        [createNote, fetchNote]
    );

    return {
        note,
        fetchNote,
        abortFindNote,
        createNote,
        findOrCreateNote,
        createNoteWithTitle,
        updateNote,
        removeNote,
        mutateNote,
        initNote,
        loading,
    };
};

const NoteState = createContainer(useNote);

export default NoteState;
