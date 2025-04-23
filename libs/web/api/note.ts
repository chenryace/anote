import { NoteModel } from 'libs/shared/note';
import { useCallback } from 'react';
import noteCache from '../cache/note';
import useFetcher from './fetcher';

export default function useNoteAPI() {
    const { loading, request, abort, error } = useFetcher();

    const find = useCallback(
        async (id: string) => {
            console.log('API调用: 查找笔记', { id });
            const result = await request<null, NoteModel>({
                method: 'GET',
                url: `/api/notes/${id}`,
            });
            console.log('API调用结果: 查找笔记', result);
            return result;
        },
        [request]
    );

    const create = useCallback(
        async (body: Partial<NoteModel>) => {
            console.log('API调用: 创建笔记', body);
            // 确保包含日期字段
            const noteWithDate = {
                ...body,
                date: body.date || new Date().toISOString()
            };
            
            const result = await request<Partial<NoteModel>, NoteModel>(
                {
                    method: 'POST',
                    url: `/api/notes`,
                },
                noteWithDate
            );
            console.log('API调用结果: 创建笔记', result);
            return result;
        },
        [request]
    );

    const mutate = useCallback(
        async (id: string, body: Partial<NoteModel>) => {
            console.log('API调用: 更新笔记', { id, body });
            
            // 确保包含日期字段
            const updatedBody = {
                ...body,
                date: body.date || new Date().toISOString()
            };
            
            let data;
            
            // 如果包含内容，先保存内容
            if (updatedBody.content) {
                console.log('保存笔记内容');
                data = await request<Partial<NoteModel>, NoteModel>(
                    {
                        method: 'POST',
                        url: `/api/notes/${id}`,
                    },
                    { content: updatedBody.content }
                );
            }
            
            // 如果有其他元数据，再保存元数据
            const metaData = { ...updatedBody };
            delete metaData.content;
            
            if (Object.keys(metaData).length > 0) {
                console.log('保存笔记元数据', metaData);
                data = await request<Partial<NoteModel>, NoteModel>(
                    {
                        method: 'POST',
                        url: `/api/notes/${id}/meta`,
                    },
                    metaData
                );
            }
            
            console.log('API调用结果: 更新笔记', data);
            return data;
        },
        [request]
    );

    // fetch note from cache or api
    const fetch = useCallback(
        async (id: string) => {
            console.log('获取笔记', { id, fromCache: true });
            const cache = await noteCache.getItem(id);
            if (cache) {
                console.log('从缓存获取笔记成功', cache);
                return cache;
            }
            
            console.log('缓存中无笔记，从API获取');
            const note = await find(id);
            if (note) {
                console.log('从API获取笔记成功，更新缓存');
                await noteCache.setItem(id, note);
            } else {
                console.log('从API获取笔记失败');
            }

            return note;
        },
        [find]
    );

    return {
        loading,
        error,
        abort,
        find,
        create,
        mutate,
        fetch,
    };
}
