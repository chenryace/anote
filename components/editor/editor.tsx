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
    
    // 使用本地状态跟踪组合输入
    const [isComposing, setIsComposing] = useState(false);
    // 存储组合输入期间的特殊字符和命令
    const pendingChars = useRef<string>("");
    // 创建MutationObserver引用
    const observerRef = useRef<MutationObserver | null>(null);
    // 跟踪编辑器状态是否被锁定
    const isEditorLocked = useRef<boolean>(false);
    // 跟踪是否需要处理特殊字符
    const needsSpecialCharHandling = useRef<boolean>(false);
    // 跟踪最后一次组合输入结束的时间
    const lastCompositionEndTime = useRef<number>(0);
    // 跟踪最后一次键盘操作的时间
    const lastKeyPressTime = useRef<number>(0);
    // 防抖计时器引用
    const debounceTimerRef = useRef<number | null>(null);
    
    // 添加处理Markdown格式化命令的函数
    const handleMarkdownCommand = useCallback((command: string) => {
        if (!editorEl.current || !editorEl.current.view) return;
        
        console.log(`处理Markdown命令: ${command}`);
        
        // 根据命令类型执行相应操作
        switch (command) {
            case '/':
                // 修改斜杠命令处理逻辑
                if (editorEl.current && editorEl.current.view) {
                    const { state, dispatch } = editorEl.current.view;
                    const tr = state.tr;
                    
                    // 确保光标位置正确
                    const pos = state.selection.from;
                    tr.insertText('/', pos);
                    
                    // 立即执行更新
                    dispatch(tr);
                    
                    // 确保命令菜单显示
                    requestAnimationFrame(() => {
                        if (editorEl.current && editorEl.current.element) {
                            editorEl.current.element.focus();
                        }
                    });
                }
                break;
            case '*':
            case '**':
                // 强制刷新视图，确保格式化正确应用
                setTimeout(() => {
                    if (editorEl.current && editorEl.current.view) {
                        editorEl.current.view.dispatch(editorEl.current.view.state.tr);
                    }
                }, 10);
                break;
            case '/':
                // 处理斜杠命令，确保命令菜单显示
                setTimeout(() => {
                    if (editorEl.current && editorEl.current.view) {
                        // 模拟斜杠命令触发
                        const { state } = editorEl.current.view;
                        editorEl.current.view.dispatch(state.tr.insertText('/'));
                    }
                }, 10);
                break;
            default:
                break;
        }
    }, [editorEl]);
    
    // 创建防抖函数来处理编辑器状态更新
    const updateEditorState = useCallback((force = false) => {
        // 如果已经有一个计时器在运行，先清除它
        if (debounceTimerRef.current !== null) {
            window.clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }
        
        // 定义处理特殊字符的函数
        const processSpecialChars = () => {
            if (needsSpecialCharHandling.current && pendingChars.current) {
                console.log(`处理特殊字符: ${pendingChars.current}`);
                
                try {
                    if (pendingChars.current.includes('/')) {
                        handleMarkdownCommand('/');
                    } else if (pendingChars.current.includes('*')) {
                        handleMarkdownCommand('*');
                    } else if (pendingChars.current.includes('#')) {
                        handleMarkdownCommand('#');
                    }
                    
                    // 重置待处理状态
                    needsSpecialCharHandling.current = false;
                    pendingChars.current = "";
                } catch (err) {
                    console.error('处理特殊字符失败', err);
                    // 出错时也重置状态，防止卡住
                    needsSpecialCharHandling.current = false;
                    pendingChars.current = "";
                }
            }
        };
        
        // 定义更新编辑器状态的函数
        const refreshEditorState = () => {
            if (editorEl.current && editorEl.current.view) {
                try {
                    // 解锁编辑器
                    isEditorLocked.current = false;
                    
                    // 处理特殊字符
                    processSpecialChars();
                    
                    // 刷新编辑器状态
                    const { state } = editorEl.current.view;
                    editorEl.current.view.dispatch(state.tr);
                    
                    // 确保编辑器接收键盘事件
                    if (editorEl.current.element) {
                        editorEl.current.element.focus();
                    }
                } catch (err) {
                    console.error('更新编辑器状态失败', err);
                }
            }
        };
        
        // 如果强制执行或者不在组合输入状态，立即执行
        if (force || !isComposing) {
            console.log('立即更新编辑器状态');
            refreshEditorState();
            return;
        }
        
        // 否则设置一个新的计时器
        debounceTimerRef.current = window.setTimeout(() => {
            console.log('延迟更新编辑器状态');
            refreshEditorState();
            
            // 清除计时器引用
            debounceTimerRef.current = null;
        }, 50); // 50毫秒的延迟，可以根据需要调整
    }, [editorEl, isComposing, handleMarkdownCommand]);

    useEffect(() => {
        if (isPreview) return;
        setHasMinHeight((backlinks?.length ?? 0) <= 0);
    }, [backlinks, isPreview]);

    // 删除这里重复声明的handleMarkdownCommand函数
    
    // 添加组合事件处理函数
    const handleCompositionStart = useCallback(() => {
        console.log('输入法组合开始');
        setIsComposing(true);
        // 清空待处理字符
        pendingChars.current = "";
        // 锁定编辑器状态
        isEditorLocked.current = true;
        // 重置特殊字符处理标志
        needsSpecialCharHandling.current = false;
        // 记录组合开始时间
        lastCompositionEndTime.current = 0;
    }, []);

    const handleCompositionEnd = useCallback(() => {
        console.log('输入法组合结束');
        
        // 记录组合输入结束时间
        lastCompositionEndTime.current = Date.now();
        
        // 如果有特殊字符需要处理，设置标志
        if (pendingChars.current) {
            console.log(`组合输入结束，待处理特殊字符: ${pendingChars.current}`);
            needsSpecialCharHandling.current = true;
        }
        
        // 重置组合状态
        setIsComposing(false);
        
        // 立即解锁编辑器
        isEditorLocked.current = false;
        
        // 检查最近是否有键盘操作（如Enter或数字键选词）
        const timeSinceLastKeyPress = Date.now() - lastKeyPressTime.current;
        const hasRecentKeyPress = timeSinceLastKeyPress < 300;
        
        // 统一通过updateEditorState处理状态更新，避免多处调用导致的竞争条件
        updateEditorState(hasRecentKeyPress); // 如果有最近的键盘操作，强制立即更新
    }, [updateEditorState]);

    // 添加编辑器DOM引用的事件监听和MutationObserver
    useEffect(() => {
        if (!editorEl.current || isPreview || readOnly) return;

        // 获取编辑器的DOM元素
        const editorDom = editorEl.current.element;
        if (!editorDom) return;

        // 添加组合事件监听
        editorDom.addEventListener('compositionstart', handleCompositionStart);
        editorDom.addEventListener('compositionend', handleCompositionEnd);
        
        // 添加输入事件监听，用于处理组合输入结束后的状态
        const handleInput = (e: Event) => {
            // 检查是否刚刚完成了组合输入
            const timeSinceCompositionEnd = Date.now() - lastCompositionEndTime.current;
            const isJustAfterComposition = timeSinceCompositionEnd < 300;
            
            // 记录事件类型，使用e参数避免TypeScript警告
            console.log(`输入事件类型: ${e.type}，目标: ${e.target ? (e.target as HTMLElement).tagName : '未知'}`); 
            
            // 无论是否刚刚完成组合输入，都尝试解锁编辑器
            isEditorLocked.current = false;
            
            // 如果刚刚完成组合输入或者正在组合输入过程中
            if (isJustAfterComposition || isComposing) {
                console.log('输入事件：检测到输入活动');
                
                // 统一通过updateEditorState处理状态更新，避免多处调用导致的竞争条件
                updateEditorState(isJustAfterComposition); // 如果刚刚完成组合输入，强制立即更新
            }
        };
        
        // 添加输入事件监听
        editorDom.addEventListener('input', handleInput);
        
        // 创建MutationObserver来监听DOM变化
        const observer = new MutationObserver((mutations) => {
            // 检查是否有文本内容变化
            const hasTextChange = mutations.some(mutation => 
                mutation.type === 'characterData' || 
                mutation.type === 'childList' || 
                (mutation.addedNodes && mutation.addedNodes.length > 0) || 
                (mutation.removedNodes && mutation.removedNodes.length > 0)
            );
            
            // 如果有文本变化，使用防抖函数更新编辑器状态
            if (hasTextChange) {
                console.log(`MutationObserver：检测到DOM变化`);
                
                // 立即解锁编辑器
                isEditorLocked.current = false;
                
                // 检查是否刚刚完成了组合输入
                const timeSinceCompositionEnd = Date.now() - lastCompositionEndTime.current;
                const isJustAfterComposition = timeSinceCompositionEnd < 300;
                
                // 检查是否最近有键盘操作（如Enter或数字键选词）
                const timeSinceLastKeyPress = Date.now() - lastKeyPressTime.current;
                const hasRecentKeyPress = timeSinceLastKeyPress < 300;
                
                // 统一通过updateEditorState处理状态更新，避免多处调用导致的竞争条件
                // 如果刚刚完成组合输入或有最近的键盘操作，强制立即更新
                updateEditorState(isJustAfterComposition || hasRecentKeyPress);
            }
        });
        
        
        // 保存observer引用以便清理
        observerRef.current = observer;
        
        // 开始观察编辑器DOM变化
        observer.observe(editorDom, {
            childList: true,
            subtree: true,
            characterData: true,
            characterDataOldValue: true
        });

        // 添加增强的安全机制，防止编辑器永久锁定
        const safetyTimer = setInterval(() => {
            // 如果编辑器锁定但不在组合输入状态，强制解锁
            if (isEditorLocked.current && !isComposing) {
                console.log('安全机制：检测到异常锁定状态，强制解锁');
                isEditorLocked.current = false;
                
                // 尝试刷新编辑器状态
                if (editorEl.current && editorEl.current.view) {
                    try {
                        editorEl.current.view.dispatch(editorEl.current.view.state.tr);
                    } catch (err) {
                        console.error('安全机制：刷新编辑器状态失败', err);
                    }
                }
            }
            
            // 检查是否长时间未解锁（降低到200ms以提高响应速度）
            const timeSinceLastComposition = Date.now() - lastCompositionEndTime.current;
            if (isEditorLocked.current && timeSinceLastComposition > 200) {
                console.log('安全机制：检测到长时间锁定，强制解锁');
                isEditorLocked.current = false;
                
                // 尝试恢复编辑器状态
                if (editorEl.current && editorEl.current.view) {
                    try {
                        // 发送一个空操作来刷新编辑器状态
                        editorEl.current.view.dispatch(editorEl.current.view.state.tr);
                        
                        // 确保编辑器接收键盘事件
                        if (editorEl.current.element) {
                            editorEl.current.element.focus();
                        }
                    } catch (err) {
                        console.error('安全机制：恢复编辑器状态失败', err);
                    }
                }
            }
            
            // 额外检查：如果用户最近尝试过键盘操作但被阻止，强制解锁
            if (isEditorLocked.current && (Date.now() - lastKeyPressTime.current < 300)) {
                console.log('安全机制：检测到最近的键盘操作，确保编辑器未锁定');
                isEditorLocked.current = false;
                
                // 清除任何待处理的特殊字符
                if (pendingChars.current) {
                    console.log(`安全机制：清除待处理的特殊字符 ${pendingChars.current}`);
                    pendingChars.current = "";
                    needsSpecialCharHandling.current = false;
                }
            }
        }, 200); // 减少间隔时间到200ms，提高响应速度

        return () => {
            // 清理事件监听和MutationObserver
            editorDom.removeEventListener('compositionstart', handleCompositionStart);
            editorDom.removeEventListener('compositionend', handleCompositionEnd);
            editorDom.removeEventListener('input', handleInput);
            if (observerRef.current) {
                observerRef.current.disconnect();
                observerRef.current = null;
            }
            // 清理安全定时器
            clearInterval(safetyTimer);
        };
    }, [editorEl, isPreview, readOnly, handleCompositionStart, handleCompositionEnd, updateEditorState, isComposing]);

    
    // 自定义键盘事件处理，解决中文输入法下斜杠命令和特殊字符问题
    const handleKeyDown = useCallback((e: ReactKeyboardEvent) => {
        // 定义需要特殊处理的Markdown语法字符
        const specialChars = ['/', '#', '*', '>', '`', '-', '+', '=', '[', ']', '(', ')', '!', '@'];
        
        // 记录最后一次键盘操作时间
        lastKeyPressTime.current = Date.now();
        
        // 处理通过数字键选择候选词的情况
        if (isComposing && e.key >= '1' && e.key <= '9') {
            console.log(`组合输入中通过数字键选择候选词: ${e.key}`);
            
            // 不要立即解锁编辑器状态，等待 compositionend 事件
            // isEditorLocked.current = false;  // 删除这行
            
            // 不要主动触发 compositionend 事件，让输入法自然完成选词
            // 删除手动触发 compositionEndEvent 的代码
            
            // 仅记录选词意图
            lastKeyPressTime.current = Date.now();
            
            // 不阻止默认行为，让输入法正常处理
            return;
        }
        
        // 检查是否刚刚完成了组合输入
        const timeSinceLastComposition = Date.now() - lastCompositionEndTime.current;
        const isJustAfterComposition = timeSinceLastComposition < 300;
        
        // 如果刚刚完成组合输入，确保编辑器未锁定
        if (isJustAfterComposition) {
            isEditorLocked.current = false;
        }
        
        // 处理Enter键，特别是在组合输入状态下
        if (e.key === 'Enter') {
            console.log('检测到Enter键');
            
            // 无论是否在组合状态，都立即解锁编辑器
            isEditorLocked.current = false;
            
            // 如果在组合输入状态，主动触发合成结束事件
            if (isComposing) {
                console.log('Enter键在组合输入状态下，主动触发compositionend');
                
                // 主动触发一个合成结束事件
                if (editorEl.current && editorEl.current.element) {
                    try {
                        // 创建并分发一个合成结束事件
                        const compositionEndEvent = new Event('compositionend');
                        editorEl.current.element.dispatchEvent(compositionEndEvent);
                        console.log('已主动触发compositionend事件');
                    } catch (err) {
                        console.error('触发compositionend事件失败', err);
                    }
                }
                
                // 立即处理，不等待其他事件
                setTimeout(() => {
                    // 确保编辑器状态正确
                    if (editorEl.current && editorEl.current.view) {
                        try {
                            // 发送一个空操作来刷新编辑器状态
                            const { state } = editorEl.current.view;
                            editorEl.current.view.dispatch(state.tr);
                            
                            // 确保编辑器接收键盘事件
                            if (editorEl.current.element) {
                                editorEl.current.element.focus();
                            }
                        } catch (err) {
                            console.error('Enter键选词后刷新编辑器状态失败', err);
                        }
                    }
                }, 0);
            }
            
            // 如果编辑器存在，确保它能接收键盘事件
            if (editorEl.current && editorEl.current.element) {
                requestAnimationFrame(() => {
                    if (editorEl.current && editorEl.current.element) {
                        editorEl.current.element.focus();
                    }
                });
            }
            
            // 不阻止默认行为，允许Enter键正常工作
            return;
        }
        
        // 处理中文输入法下输入英文后无法换行或删除的问题
        if (e.key === 'Backspace' && (!isComposing || isJustAfterComposition)) {
            console.log(`检测到键盘操作: ${e.key}`);
            // 强制解锁编辑器
            isEditorLocked.current = false;
            
            // 如果编辑器存在，确保它能接收键盘事件
            if (editorEl.current && editorEl.current.element) {
                requestAnimationFrame(() => {
                    if (editorEl.current && editorEl.current.element) {
                        editorEl.current.element.focus();
                    }
                });
            }
            
            // 不阻止默认行为，允许键盘操作正常工作
            return;
        }
        
        // 如果编辑器状态被锁定，且按下的是Enter或Backspace，则阻止默认行为
        if (isEditorLocked.current && (e.key === 'Enter' || e.key === 'Backspace')) {
            console.log(`编辑器锁定中，阻止键: ${e.key}`);
            
            // 检查是否刚刚完成了组合输入
            if (isJustAfterComposition) {
                console.log('检测到刚刚完成组合输入，允许键盘操作');
                isEditorLocked.current = false;
                return; // 允许事件继续传播
            }
            
            // 强制解锁编辑器，但仍然阻止这次事件
            isEditorLocked.current = false;
            e.preventDefault();
            e.stopPropagation();
            
            // 使用requestAnimationFrame确保在下一帧渲染前刷新编辑器状态
            requestAnimationFrame(() => {
                if (editorEl.current && editorEl.current.view) {
                    try {
                        // 确保编辑器状态正确
                        const { state } = editorEl.current.view;
                        editorEl.current.view.dispatch(state.tr);
                        
                        // 确保编辑器接收键盘事件
                        if (editorEl.current.element) {
                            editorEl.current.element.focus();
                        }
                    } catch (err) {
                        console.error('刷新编辑器状态失败', err);
                    }
                }
            });
            
            return;
        }
        
        // 如果在组合输入状态下按下特殊字符
        if (isComposing && specialChars.includes(e.key)) {
            console.log(`组合输入中检测到特殊字符: ${e.key}`);
            
            // 记录特殊字符，用于组合输入结束后处理（只添加一次）
            pendingChars.current += e.key;
            console.log(`组合输入中记录特殊字符: ${pendingChars.current}`);
            
            // 设置标志，在组合输入结束后处理
            needsSpecialCharHandling.current = true;
            
            // 如果是斜杠命令，可能需要特殊处理
            if (e.key === '/') {
                // 尝试主动触发组合结束事件
                if (editorEl.current && editorEl.current.element) {
                    try {
                        // 创建并分发一个合成结束事件
                        setTimeout(() => {
                            if (isComposing && editorEl.current && editorEl.current.element) {
                                const compositionEndEvent = new Event('compositionend');
                                editorEl.current.element.dispatchEvent(compositionEndEvent);
                                console.log('斜杠命令：已主动触发compositionend事件');
                            }
                        }, 10);
                    } catch (err) {
                        console.error('触发compositionend事件失败', err);
                    }
                }
            }
            
            // 阻止默认行为
            e.preventDefault();
            e.stopPropagation();
            
            // 如果是斜杠命令，立即在编辑器中显示一个占位符，以便用户知道命令已被捕获
            if (e.key === '/' && editorEl.current && editorEl.current.view) {
                // 在编辑器中显示视觉反馈，但不实际插入字符
                const { state } = editorEl.current.view;
                const { selection } = state;
                
                // 在当前位置显示一个闪烁的光标，提示用户命令已被捕获
                editorEl.current.view.dispatch(state.tr.setSelection(selection));
            }
            return;
        }
        
        // 处理组合输入期间的格式化键，防止意外触发Markdown格式化
        if (isComposing && (e.key === 'Enter' || e.key === 'Tab' || e.key === 'Backspace')) {
            console.log(`组合输入中检测到格式键: ${e.key}`);
            
            // 对于退格键，需要特殊处理，允许删除待处理的特殊字符
            if (e.key === 'Backspace' && pendingChars.current.length > 0) {
                pendingChars.current = pendingChars.current.slice(0, -1);
                console.log(`删除待处理字符，剩余: ${pendingChars.current}`);
            } else {
                // 对于其他格式键，阻止默认行为
                e.preventDefault();
                e.stopPropagation();
            }
            return;
        }
        
        // 处理中文输入法下的斜杠键
        if (!isComposing && e.key === '/' && e.nativeEvent && e.nativeEvent.isComposing) {
            console.log('检测到中文输入法下的斜杠键');
            e.preventDefault();
            e.stopPropagation();
            
            // 立即插入斜杠，确保不会被输入法干扰
            if (editorEl.current && editorEl.current.view) {
                const { state } = editorEl.current.view;
                editorEl.current.view.dispatch(state.tr.insertText('/'));
                
                // 确保编辑器不会被锁定
                isEditorLocked.current = false;
                
                // 使用requestAnimationFrame确保在下一帧渲染前处理
                requestAnimationFrame(() => {
                    if (editorEl.current && editorEl.current.view) {
                        try {
                            const { state } = editorEl.current.view;
                            editorEl.current.view.dispatch(state.tr);
                            
                            // 确保编辑器接收键盘事件
                            if (editorEl.current.element) {
                                editorEl.current.element.focus();
                            }
                        } catch (err) {
                            console.error('处理斜杠命令失败', err);
                        }
                    }
                });
            }
            return;
        }
    }, [isComposing, editorEl]);

    // 自定义onChange处理，确保在组合输入期间不会打断输入
    const handleEditorChange = useCallback(
        (value: () => string) => {
            // 如果正在组合输入，不立即触发onChange
            if (isComposing) {
                console.log('组合输入中，延迟处理onChange');
                return;
            }
            
            // 如果需要处理特殊字符，不立即触发onChange
            if (needsSpecialCharHandling.current) {
                console.log('需要处理特殊字符，延迟处理onChange');
                setTimeout(() => {
                    onEditorChange(value);
                }, 10); // 减少延迟时间
                return;
            }
            
            // 否则正常处理onChange
            onEditorChange(value);
        },
        [isComposing, onEditorChange]
    );
    
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
