import { TextareaAutosize } from '@material-ui/core';
import useI18n from 'libs/web/hooks/use-i18n';
import { has } from 'lodash';
import { useRouter } from 'next/router';
import {
    FC,
    useCallback,
    KeyboardEvent,
    useRef,
    useMemo,
    ChangeEvent,
    useEffect,
    useState,
} from 'react';
import EditorState from 'libs/web/state/editor';

const EditTitle: FC<{ readOnly?: boolean }> = ({ readOnly }) => {
    const { editorEl, onTitleChange, note, localTitle } = EditorState.useContainer();
    const router = useRouter();
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const [inputValue, setInputValue] = useState<string>('');
    const isNewNote = useMemo(() => has(router.query, 'new'), [router.query]);
    
    // 处理Enter键按下事件
    const onInputTitle = useCallback(
        (event: KeyboardEvent<HTMLTextAreaElement>) => {
            if (event.key.toLowerCase() === 'enter') {
                event.stopPropagation();
                event.preventDefault();
                editorEl.current?.focusAtEnd();
            }
        },
        [editorEl]
    );

    // 改进标题变更处理，添加本地状态
    const handleTitleChange = useCallback(
        (event: ChangeEvent<HTMLTextAreaElement>) => {
            const title = event.target.value;
            setInputValue(title); // 更新本地状态
            
            // 对于新笔记，延迟调用onTitleChange，避免在输入过程中触发保存
            if (isNewNote) {
                // 使用setTimeout模拟防抖，避免频繁触发
                setTimeout(() => {
                    onTitleChange(title);
                }, 300);
            } else {
                // 对于已有笔记，直接更新
                onTitleChange(title);
            }
        },
        [onTitleChange, isNewNote]
    );
    
    // 同步本地标题到输入框
    useEffect(() => {
        if (inputRef.current) {
            // 如果本地有输入值且是新笔记，优先使用本地输入值
            if (isNewNote && inputValue) {
                inputRef.current.value = inputValue;
            } else if (localTitle !== undefined) {
                // 否则使用从状态管理器获取的值
                inputRef.current.value = localTitle;
                setInputValue(localTitle);
            }
        }
    }, [localTitle, isNewNote, inputValue]);

    const autoFocus = useMemo(() => has(router.query, 'new'), [router.query]);
    const { t } = useI18n();

    return (
        <h1 className="text-3xl mb-8">
            <TextareaAutosize
                ref={inputRef}
                dir="auto"
                readOnly={readOnly}
                className="outline-none w-full resize-none block bg-transparent"
                placeholder={t('New Page')}
                defaultValue={isNewNote && inputValue ? inputValue : (localTitle || note?.title)}
                key={isNewNote ? undefined : note?.id} // 对于新笔记，不使用note.id作为key，避免重新渲染
                onKeyPress={onInputTitle}
                onChange={handleTitleChange}
                maxLength={128}
                autoFocus={autoFocus}
            />
        </h1>
    );
};

export default EditTitle;
