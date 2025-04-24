import { FC, useEffect, useState, useCallback, KeyboardEvent as ReactKeyboardEvent, useRef } from 'react';
import { use100vh } from 'react-div-100vh';
import MarkdownEditor, { Props } from '@notea/rich-markdown-editor';
import { useEditorTheme } from './theme';
import useMounted from 'libs/web/hooks/use-mounted';
import Tooltip from './tooltip';
import extensions from './extensions';
import EditorState from 'libs/web/state/editor';
import { useDictionary } from './dictionary';
import { useEmbeds } from './embeds';

// --- 添加 debounce 工具函数 ---
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return function(this: ThisParameterType<T>, ...args: Parameters<T>) {
        const context = this;
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            func.apply(context, args);
        }, wait);
    };
}
// --- debounce 工具函数结束 ---


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
    // const toast = useToast(); // <--- 删除这一行
    const dictionary = useDictionary();
    const embeds = useEmbeds();

    // 使用本地状态跟踪组合输入
    const [isComposing, setIsComposing] = useState(false);
    // 存储组合输入期间的特殊字符和命令
    const pendingChars = useRef<string>("");
    // 创建MutationObserver引用
    const observerRef = useRef<MutationObserver | null>(null);
    // 跟踪编辑器状态是否被锁定 (这个状态的重要性会降低)
    const isEditorLocked = useRef<boolean>(false);
    // 跟踪是否需要处理特殊字符
    const needsSpecialCharHandling = useRef<boolean>(false);
    // 跟踪最后一次组合输入结束的时间
    const lastCompositionEndTime = useRef<number>(0);
    // 跟踪最后一次键盘操作的时间 (这个可能仍然有用，用于判断是否是选词操作)
    const lastKeyPressTime = useRef<number>(0);
    // --- 新增：用于存储防抖函数的引用 ---
    const debouncedFinalizeRef = useRef<(() => void) | null>(null);


    useEffect(() => {
        if (isPreview) return;
        setHasMinHeight((backlinks?.length ?? 0) <= 0);
    }, [backlinks, isPreview]);

    // 处理Markdown格式化命令的函数 (移除内部的setTimeout)
    const handleMarkdownCommand = useCallback((command: string) => {
        if (!editorEl.current || !editorEl.current.view) return;

        console.log(`处理Markdown命令: ${command}`);
        const { state, view } = editorEl.current;

        // 根据命令类型执行相应操作
        switch (command) {
            case '*':
            case '**':
                // 直接刷新视图
                view.dispatch(state.tr);
                break;
            case '/':
                // 直接模拟斜杠命令触发
                view.dispatch(state.tr.insertText('/'));
                break;
            // 添加 # 的处理逻辑 (如果之前没有的话)
            case '#':
                 // 例如，可以触发标题相关的命令，或者简单刷新
                 view.dispatch(state.tr);
                 break;
            default:
                break;
        }
    }, [editorEl]);

    // --- 新增：核心的最终处理函数 ---
    const finalizeEditorState = useCallback(() => {
        console.log('Finalizing editor state...');
        // 使用可选链提前检查 editorEl.current 和 view
        if (!editorEl.current?.view) return;

        // 解构时也使用可选链获取 element，虽然 view 已经保证 editorEl.current 存在
        const { view, element } = editorEl.current;

        // 1. 确保解锁 (虽然锁的重要性降低，但保持一致性)
        isEditorLocked.current = false;

        // 2. 处理待处理的特殊字符
        if (needsSpecialCharHandling.current && pendingChars.current) {
            console.log(`Finalize: 处理特殊字符 ${pendingChars.current}`);
            try {
                handleMarkdownCommand(pendingChars.current);
            } catch (err) {
                console.error('Finalize: 处理特殊字符失败', err);
            } finally {
                // 无论成功失败，都重置状态
                needsSpecialCharHandling.current = false;
                pendingChars.current = "";
            }
        }

        // 3. 刷新编辑器状态 (确保视图同步)
        try {
            console.log('Finalize: Dispatching state transaction');
            view.dispatch(view.state.tr);
        } catch (err) {
            console.error('Finalize: 刷新编辑器状态失败', err);
        }

        // 4. 确保编辑器获得焦点 (使用可选链)
        try {
            // 直接使用可选链访问 focus，如果 element 为 null 或 undefined，则不会执行 focus()
            console.log('Finalize: Attempting to set focus');
            element?.focus();
        } catch (err) {
            // 虽然可选链能防止 TypeError，但 focus() 本身可能抛出其他错误
            console.error('Finalize: 设置焦点失败', err);
        }

    }, [editorEl, handleMarkdownCommand]);


    // --- 在组件挂载时创建防抖函数 ---
    useEffect(() => {
        // 设置一个合适的延迟，例如 50ms 或 100ms
        debouncedFinalizeRef.current = debounce(finalizeEditorState, 50);
    }, [finalizeEditorState]);


    // 组合事件处理函数 - handleCompositionStart (基本不变)
    const handleCompositionStart = useCallback(() => {
        console.log('输入法组合开始');
        setIsComposing(true);
        pendingChars.current = ""; // 清空待处理字符
        isEditorLocked.current = true; // 锁定
        needsSpecialCharHandling.current = false;
        lastCompositionEndTime.current = 0;
        // 取消可能正在进行的 finalize 调用，防止干扰输入过程
        if (debouncedFinalizeRef.current) {
           // 如果 debounce 函数库支持 cancel 方法，可以在这里调用
           // 例如: debouncedFinalizeRef.current.cancel();
           // 对于我们简单的 debounce 实现，无法直接 cancel，但锁定状态会阻止 finalize 内部逻辑
        }
    }, []);

    // 组合事件处理函数 - handleCompositionEnd (大幅简化)
    const handleCompositionEnd = useCallback(() => {
        console.log('输入法组合结束');

        // 记录结束时间
        lastCompositionEndTime.current = Date.now();

        // 检查是否有特殊字符需要处理 (仅设置标志，不立即处理)
        // 注意：这里需要一种方式在组合输入过程中记录 pendingChars
        // 可能需要在 handleInput 或 MutationObserver 中更新 pendingChars
        // 假设 pendingChars 在其他地方被正确填充了
        if (pendingChars.current) {
            console.log(`组合输入结束，标记待处理特殊字符: ${pendingChars.current}`);
            needsSpecialCharHandling.current = true;
        }

        // 重置组合状态
        setIsComposing(false);

        // **关键：调用防抖后的核心函数**
        if (debouncedFinalizeRef.current) {
            console.log('CompositionEnd: 请求 finalize');
            debouncedFinalizeRef.current();
        }

        // 移除所有旧的多层解锁和刷新逻辑
        // isEditorLocked.current = false; // 由 finalize 处理
        // if (hasRecentKeyPress) { ... } // 移除
        // 第一层：立即执行 // 移除
        // 第二层：requestAnimationFrame // 移除
        // 第三层：setTimeout // 移除

    }, []); // 依赖项可能需要调整，取决于 pendingChars 如何更新

    // 添加编辑器DOM引用的事件监听和MutationObserver (useEffect)
    useEffect(() => {
        if (!editorEl.current || isPreview || readOnly) return;

        const editorDom = editorEl.current.element;
        if (!editorDom) return;

        // 添加组合事件监听
        editorDom.addEventListener('compositionstart', handleCompositionStart);
        editorDom.addEventListener('compositionend', handleCompositionEnd);

        // 输入事件监听 (简化)
        const handleInput = (e: Event) => {
            console.log(`输入事件: ${e.type}`);

            // 如果正在组合输入，可能需要在这里记录输入的特殊字符到 pendingChars.current
            if (isComposing && e instanceof InputEvent && e.data) {
                 if (['/', '*', '#'].includes(e.data)) {
                     pendingChars.current = e.data; // 简单记录最后输入的特殊字符
                     console.log(`组合输入中记录特殊字符: ${pendingChars.current}`);
                 }
            }

            // **关键：调用防抖后的核心函数**
            // 可以在这里加一些判断，比如只在非组合输入时触发，或者总是触发让 debounce 处理
            if (!isComposing && debouncedFinalizeRef.current) {
                 console.log('Input: 请求 finalize');
                 debouncedFinalizeRef.current();
            }
            // 移除旧的解锁和特殊字符处理逻辑
        };

        editorDom.addEventListener('input', handleInput);

        // MutationObserver (大幅简化)
        const observer = new MutationObserver((mutations) => {
            // 主要用于检测非预期/外部的DOM变化，或者作为最后的保险
            // 在这个重构版本中，它的核心作用降低了
            // 可以考虑只在特定情况下触发 finalize，或者完全移除其 finalize 调用

            const hasRelevantChange = mutations.some(mutation =>
                mutation.type === 'characterData' || mutation.type === 'childList'
            );

            if (hasRelevantChange && !isComposing) {
                 console.log(`MutationObserver：检测到DOM变化 (非组合输入状态)`);
                 // 可以选择性地调用 finalize，作为一种保险
                 // if (debouncedFinalizeRef.current) {
                 //    console.log('MutationObserver: 请求 finalize (保险)');
                 //    debouncedFinalizeRef.current();
                 // }
            }
             // 移除旧的解锁、特殊字符处理和状态刷新逻辑
        });

        observerRef.current = observer;
        observer.observe(editorDom, {
            childList: true,
            subtree: true,
            characterData: true,
            // characterDataOldValue: true // 这个通常可以去掉，减少开销
        });

        // 安全定时器 (可以保留，作为最后防线，但逻辑简化)
        const safetyTimer = setInterval(() => {
            if (isEditorLocked.current && !isComposing) {
                console.warn('安全机制：检测到异常锁定状态，强制调用 finalize');
                if (debouncedFinalizeRef.current) {
                    debouncedFinalizeRef.current(); // 调用核心函数来解锁和恢复
                } else {
                    // Fallback if debounce function not ready
                    isEditorLocked.current = false;
                }
            }
            // 移除基于 lastCompositionEndTime 的检查，因为 finalize 会处理
        }, 1000); // 可以适当增加间隔，比如 1 秒

        // 清理函数
        return () => {
            console.log('清理编辑器事件监听和Observer');
            editorDom.removeEventListener('compositionstart', handleCompositionStart);
            editorDom.removeEventListener('compositionend', handleCompositionEnd);
            editorDom.removeEventListener('input', handleInput);
            if (observerRef.current) {
                observerRef.current.disconnect();
                observerRef.current = null;
            }
            clearInterval(safetyTimer);
            // 如果 debounce 库支持 cancel，在这里调用
            // if (debouncedFinalizeRef.current && debouncedFinalizeRef.current.cancel) {
            //     debouncedFinalizeRef.current.cancel();
            // }
        };

    }, [editorEl, isPreview, readOnly, handleCompositionStart, handleCompositionEnd, finalizeEditorState, isComposing]); // 注意依赖项的变化


    // 键盘事件处理 (记录按键时间)
    const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
        lastKeyPressTime.current = Date.now();
        // 这里可以保留或添加其他必要的键盘快捷键处理逻辑
    }, []);


    // 编辑器渲染部分
    if (!mounted) return null;

    const editorStyle = isPreview
        ? { padding: '16px 0' }
        : {
              minHeight: hasMinHeight ? `calc(${height}px - 140px)` : 'auto',
              padding: '16px 0',
          };

    return (
        <div style={editorStyle} className="relative">
            <MarkdownEditor
                readOnly={readOnly}
                id={note?.id}
                ref={editorEl}
                readOnly={readOnly}
                extensions={extensions}
                theme={editorTheme}
                tooltip={Tooltip}
                placeholder={dictionary.editorPlaceholder}
                dictionary={dictionary}
                onKeyDown={handleKeyDown} // 确保绑定了 handleKeyDown
                onChange={onEditorChange}
                onSearchLink={onSearchLink}
                onCreateLink={onCreateLink}
                onClickLink={onClickLink}
                onUploadImage={onUploadImage}
                onHoverLink={onHoverLink}
                value={note?.content}
                embeds={embeds}
                className={isPreview ? 'is-preview' : ''}
            />
        </div>
    );
};

export default Editor;
