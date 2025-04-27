/**
 * LocalStorage存储服务
 * 提供简单高效的本地存储方案，专注于笔记编辑功能
 */

const STORAGE_PREFIX = 'anote_';
const CONTENT_SUFFIX = '_content';
const TITLE_SUFFIX = '_title';
const META_SUFFIX = '_meta';
const LAST_MODIFIED_SUFFIX = '_modified';

interface NoteData {
    id: string;
    content?: string;
    title?: string;
    lastModified: number;
}

class LocalStorageService {
    /**
     * 保存笔记内容到localStorage
     */
    async saveNote(noteId: string, content?: string, title?: string): Promise<void> {
        if (!noteId) return;
        
        const timestamp = Date.now();
        
        // 分别存储内容和标题，避免单个存储项过大
        if (content !== undefined) {
            localStorage.setItem(STORAGE_PREFIX + noteId + CONTENT_SUFFIX, content);
        }
        
        if (title !== undefined) {
            localStorage.setItem(STORAGE_PREFIX + noteId + TITLE_SUFFIX, title);
        }
        
        // 存储最后修改时间
        localStorage.setItem(STORAGE_PREFIX + noteId + LAST_MODIFIED_SUFFIX, timestamp.toString());
        
        console.log('笔记已保存到localStorage', { noteId, contentLength: content?.length });
    }
    
    /**
     * 从localStorage获取笔记内容
     */
    async getNote(noteId: string): Promise<NoteData | undefined> {
        if (!noteId) return undefined;
        
        const content = localStorage.getItem(STORAGE_PREFIX + noteId + CONTENT_SUFFIX) || undefined;
        const title = localStorage.getItem(STORAGE_PREFIX + noteId + TITLE_SUFFIX) || undefined;
        const lastModifiedStr = localStorage.getItem(STORAGE_PREFIX + noteId + LAST_MODIFIED_SUFFIX);
        
        // 如果没有找到任何数据，返回undefined
        if (!content && !title && !lastModifiedStr) return undefined;
        
        const lastModified = lastModifiedStr ? parseInt(lastModifiedStr, 10) : Date.now();
        
        return {
            id: noteId,
            content,
            title,
            lastModified
        };
    }
    
    /**
     * 删除笔记内容
     */
    async deleteNote(noteId: string): Promise<void> {
        if (!noteId) return;
        
        localStorage.removeItem(STORAGE_PREFIX + noteId + CONTENT_SUFFIX);
        localStorage.removeItem(STORAGE_PREFIX + noteId + TITLE_SUFFIX);
        localStorage.removeItem(STORAGE_PREFIX + noteId + LAST_MODIFIED_SUFFIX);
        localStorage.removeItem(STORAGE_PREFIX + noteId + META_SUFFIX);
    }
    
    /**
     * 获取所有未同步的笔记
     */
    async getUnsyncedNotes(): Promise<NoteData[]> {
        const notes: NoteData[] = [];
        const noteIds = new Set<string>();
        
        // 遍历localStorage查找所有笔记
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
            
            // 提取noteId
            if (key.endsWith(CONTENT_SUFFIX)) {
                const noteId = key.slice(STORAGE_PREFIX.length, key.length - CONTENT_SUFFIX.length);
                noteIds.add(noteId);
            } else if (key.endsWith(TITLE_SUFFIX)) {
                const noteId = key.slice(STORAGE_PREFIX.length, key.length - TITLE_SUFFIX.length);
                noteIds.add(noteId);
            }
        }
        
        // 获取每个笔记的完整数据
        for (const noteId of noteIds) {
            const noteData = await this.getNote(noteId);
            if (noteData) {
                notes.push(noteData);
            }
        }
        
        return notes;
    }
    
    /**
     * 清除所有笔记数据
     */
    async clearAll(): Promise<void> {
        const keysToRemove: string[] = [];
        
        // 找出所有需要删除的键
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(STORAGE_PREFIX)) {
                keysToRemove.push(key);
            }
        }
        
        // 删除所有键
        keysToRemove.forEach(key => localStorage.removeItem(key));
    }
    
    /**
     * 设置元数据
     */
    async setMeta(key: string, value: any): Promise<void> {
        try {
            const serializedValue = JSON.stringify(value);
            localStorage.setItem(STORAGE_PREFIX + key + META_SUFFIX, serializedValue);
        } catch (error) {
            console.error('元数据序列化失败', error);
        }
    }
    
    /**
     * 获取元数据
     */
    async getMeta(key: string): Promise<any> {
        const serializedValue = localStorage.getItem(STORAGE_PREFIX + key + META_SUFFIX);
        if (!serializedValue) return null;
        
        try {
            return JSON.parse(serializedValue);
        } catch (error) {
            console.error('元数据解析失败', error);
            return null;
        }
    }
    
    /**
     * 获取笔记的最后修改时间
     */
    async getLastModified(noteId: string): Promise<number | null> {
        if (!noteId) return null;
        
        const lastModifiedStr = localStorage.getItem(STORAGE_PREFIX + noteId + LAST_MODIFIED_SUFFIX);
        return lastModifiedStr ? parseInt(lastModifiedStr, 10) : null;
    }
    
    /**
     * 检查笔记是否存在
     */
    async hasNote(noteId: string): Promise<boolean> {
        if (!noteId) return false;
        
        return !!localStorage.getItem(STORAGE_PREFIX + noteId + CONTENT_SUFFIX) || 
               !!localStorage.getItem(STORAGE_PREFIX + noteId + TITLE_SUFFIX);
    }
}

// 导出单例实例
const localStorageService = new LocalStorageService();
export default localStorageService;