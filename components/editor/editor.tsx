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

    useEffect(() => {
        if (isPreview) return;
        setHasMinHeight((backlinks?.length ?? 0) <= 0);
    }, [backlinks, isPreview]);

    // 添加处理Markdown格式化命令的函数
    const handleMarkdownCommand = useCallback((command: string) => {
        if (!editorEl.current || !editorEl.current.view) return;
        
        console.log(`处理Markdown命令: ${command}`);
        
        try {
            // 根据命令类型执行相应操作
            switch (command) {
                case '*':
                case '**':
                    // 强制刷新视图，确保格式化正确应用
                    const { state: boldState } = editorEl.current.view;
                    editorEl.current.view.dispatch(boldState.tr);
                    
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
                                console.error('处理加粗命令失败', err);
                            }
                        }
                    });
                    break;
                case '/':
                    // 处理斜杠命令，确保命令菜单显示
                    const { state: slashState } = editorEl.current.view;
                    editorEl.current.view.dispatch(slashState.tr.insertText('/'));
                    
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
                    break;
                case '#':
                    // 处理标题命令
                    const { state: headingState } = editorEl.current.view;
                    editorEl.current.view.dispatch(headingState.tr);
                    
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
                                console.error('处理标题命令失败', err);
                            }
                        }
                    });
                    break;
                default:
                    // 处理其他命令
                    const { state: defaultState } = editorEl.current.view;
                    editorEl.current.view.dispatch(defaultState.tr);
                    
                    // 确保编辑器接收键盘事件
                    if (editorEl.current.element) {
                        editorEl.current.element.focus();
                    }
                    break;
            }
        } catch (err) {
            console.error(`处理Markdown命令失败: ${command}`, err);
            
            // 出错时也确保编辑器状态正确
            try {
                if (editorEl.current && editorEl.current.view) {
                    const { state } = editorEl.current.view;
                    editorEl.current.view.dispatch(state.tr);
                    
                    // 确保编辑器接收键盘事件
                    if (editorEl.current.element) {
                        editorEl.current.element.focus();
                    }
                }
            } catch (innerErr) {
                console.error('恢复编辑器状态失败', innerErr);
            }
        }
    }, [editorEl]);

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
    }, []);

    const handleCompositionEnd = useCallback(() => {
        console.log('输入法组合结束');
        
        // 记录组合输入结束时间
        lastCompositionEndTime.current = Date.now();
        
        // 如果有特殊字符需要处理，设置标志
        if (pendingChars.current) {
            needsSpecialCharHandling.current = true;
        }
        
        // 重置组合状态
        setIsComposing(false);
        
        // 立即解锁编辑器
        isEditorLocked.current = false;
        
        // 使用多层次的解锁机制确保编辑器状态正确恢复
        // 第一层：立即执行
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
                console.error('组合输入结束时刷新编辑器状态失败', err);
            }
        }
        
        // 第二层：使用requestAnimationFrame确保在下一帧渲染前刷新编辑器状态
        requestAnimationFrame(() => {
            if (editorEl.current && editorEl.current.view) {
                try {
                    // 再次发送一个空操作来刷新编辑器状态
                    const { state } = editorEl.current.view;
                    editorEl.current.view.dispatch(state.tr);
                    
                    // 再次确认编辑器已解锁
                    isEditorLocked.current = false;
                    
                    // 确保编辑器接收键盘事件
                    if (editorEl.current.element) {
                        editorEl.current.element.focus();
                    }
                } catch (err) {
                    console.error('RAF中刷新编辑器状态失败', err);
                }
            }
        });
        
        // 第三层：使用setTimeout作为最后的保障
        setTimeout(() => {
            isEditorLocked.current = false;
            if (editorEl.current && editorEl.current.view) {
                try {
                    // 最后一次尝试刷新编辑器状态
                    const { state } = editorEl.current.view;
                    editorEl.current.view.dispatch(state.tr);
                    
                    // 确保编辑器接收键盘事件
                    if (editorEl.current.element) {
                        editorEl.current.element.focus();
                    }
                } catch (err) {
                    console.error('setTimeout中刷新编辑器状态失败', err);
                }
            }
        }, 50);
        
        // 第四层：使用更长的延迟作为最终保障
        setTimeout(() => {
            isEditorLocked.current = false;
            needsSpecialCharHandling.current = false;
            pendingChars.current = "";
            
            if (editorEl.current && editorEl.current.view) {
                try {
                    // 最终保障：刷新编辑器状态
                    const { state } = editorEl.current.view;
                    editorEl.current.view.dispatch(state.tr);
                    
                    // 确保编辑器接收键盘事件
                    if (editorEl.current.element) {
                        editorEl.current.element.focus();
                    }
                } catch (err) {
                    console.error('最终保障刷新编辑器状态失败', err);
                }
            }
        }, 200);
    }, [editorEl]);

    // 添加编辑器DOM引用的事件监听和输入事件处理
    useEffect(() => {
        if (!editorEl.current || isPreview || readOnly) return;

        // 获取编辑器的DOM元素
        const editorDom = editorEl.current.element;
        if (!editorDom) return;

        // 添加组合事件监听
        editorDom.addEventListener('compositionstart', handleCompositionStart);
        editorDom.addEventListener('compositionend', handleCompositionEnd);
        
        // 添加输入事件监听，用于处理组合输入结束后的状态
        const handleInput = () => {
            // 检查是否刚刚完成了组合输入
            const timeSinceCompositionEnd = Date.now() - lastCompositionEndTime.current;
            const isJustAfterComposition = timeSinceCompositionEnd < 300;
            
            // 如果刚刚完成组合输入
            if (isJustAfterComposition) {
                console.log('输入事件：检测到刚刚完成组合输入');
                
                // 立即解锁编辑器
                isEditorLocked.current = false;
                
                // 如果有特殊字符需要处理
                if (needsSpecialCharHandling.current && pendingChars.current) {
                    console.log(`输入事件：处理特殊字符 ${pendingChars.current}`);
                    
                    // 立即尝试处理特殊字符
                    try {
                        if (pendingChars.current.includes('/')) {
                            handleMarkdownCommand('/');
                        } else if (pendingChars.current.includes('*')) {
                            handleMarkdownCommand('*');
                        } else if (pendingChars.current.includes('#')) {
                            handleMarkdownCommand('#');
                        }
                    } catch (err) {
                        console.error('处理特殊字符失败', err);
                    }
                    
                    // 使用requestAnimationFrame确保在下一帧再次处理
                    requestAnimationFrame(() => {
                        try {
                            // 再次尝试处理特殊字符
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
                            
                            // 确保编辑器接收键盘事件
                            if (editorEl.current && editorEl.current.element) {
                                editorEl.current.element.focus();
                            }
                        } catch (err) {
                            console.error('处理特殊字符失败(RAF)', err);
                        }
                    });
                } else {
                    // 即使没有特殊字符，也确保编辑器状态正确
                    if (editorEl.current && editorEl.current.view) {
                        // 发送一个空操作来刷新编辑器状态
                        editorEl.current.view.dispatch(editorEl.current.view.state.tr);
                    }
                }
            }
        };
        
        // 添加输入事件监听
        editorDom.addEventListener('input', handleInput);
        
        // 创建MutationObserver作为备用机制，确保DOM变化后能正确处理特殊字符
        const observer = new MutationObserver((mutations) => {
            // 检查是否刚刚完成了组合输入
            const timeSinceCompositionEnd = Date.now() - lastCompositionEndTime.current;
            const isJustAfterComposition = timeSinceCompositionEnd < 500; // 使用更宽松的时间窗口
            
            // 如果编辑器被锁定，立即解锁
            if (isEditorLocked.current) {
                console.log('MutationObserver：检测到编辑器锁定状态，立即解锁');
                isEditorLocked.current = false;
            }
            
            // 如果不需要处理特殊字符或没有待处理字符，检查是否需要恢复编辑器状态
            if (!needsSpecialCharHandling.current || !pendingChars.current) {
                // 如果刚刚完成组合输入，确保编辑器状态正确
                if (isJustAfterComposition) {
                    // 确保编辑器未锁定
                    isEditorLocked.current = false;
                    
                    // 尝试刷新编辑器状态
                    if (editorEl.current && editorEl.current.view) {
                        try {
                            // 发送一个空操作来刷新编辑器状态
                            editorEl.current.view.dispatch(editorEl.current.view.state.tr);
                        } catch (err) {
                            console.error('MutationObserver：刷新编辑器状态失败', err);
                        }
                    }
                }
                return;
            }
            
            // 检查是否有文本内容变化
            const hasTextChange = mutations.some(mutation => 
                mutation.type === 'characterData' || 
                mutation.type === 'childList' || 
                mutation.addedNodes.length > 0 || 
                mutation.removedNodes.length > 0
            );
            
            if (hasTextChange) {
                console.log(`MutationObserver：检测到DOM变化，处理特殊字符 ${pendingChars.current}`);
                
                // 立即解锁编辑器
                isEditorLocked.current = false;
                
                try {
                    // 处理特殊字符
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
                    
                    // 确保编辑器接收键盘事件
                    if (editorEl.current && editorEl.current.element) {
                        editorEl.current.element.focus();
                    }
                } catch (err) {
                    console.error('MutationObserver：处理特殊字符失败', err);
                    // 出错时也重置状态，防止卡住
                    needsSpecialCharHandling.current = false;
                    pendingChars.current = "";
                    isEditorLocked.current = false;
                }
                
                // 使用requestAnimationFrame确保在下一帧再次尝试
                requestAnimationFrame(() => {
                    // 确保编辑器未锁定
                    isEditorLocked.current = false;
                    
                    // 确保编辑器状态正确
                    if (editorEl.current && editorEl.current.view) {
                        try {
                            // 发送一个空操作来刷新编辑器状态
                            editorEl.current.view.dispatch(editorEl.current.view.state.tr);
                        } catch (err) {
                            console.error('MutationObserver(RAF)：刷新编辑器状态失败', err);
                        }
                    }
                });
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
            if ((Date.now() - lastKeyPressTime.current < 300) && (timeSinceLastComposition > 100)) {
                console.log('安全机制：检测到最近的键盘操作，确保编辑器未锁定');
                isEditorLocked.current = false;
                
                // 清除任何待处理的特殊字符
                if (pendingChars.current) {
                    console.log(`安全机制：清除待处理的特殊字符 ${pendingChars.current}`);
                    pendingChars.current = "";
                    needsSpecialCharHandling.current = false;
                }
            }
            
            // 全局状态检查：确保组合输入结束后的状态一致性
            if (!isComposing && timeSinceLastComposition < 500) {
                // 确保编辑器未锁定
                isEditorLocked.current = false;
                
                // 如果编辑器存在，确保它能接收键盘事件
                if (editorEl.current && editorEl.current.element) {
                    // 每隔一段时间尝试聚焦编辑器，确保用户可以继续输入
                    if (timeSinceLastComposition % 100 === 0) {
                        editorEl.current.element.focus();
                    }
                }
            }
        }, 100); // 减少间隔时间到100ms，大幅提高响应速度

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
    }, [editorEl, isPreview, readOnly, handleCompositionStart, handleCompositionEnd, handleMarkdownCommand, isComposing]);


    
    // 自定义键盘事件处理，解决中文输入法下斜杠命令和特殊字符问题
    const handleKeyDown = useCallback((e: ReactKeyboardEvent) => {
        // 定义需要特殊处理的Markdown语法字符
        const specialChars = ['/', '#', '*', '>', '`', '-', '+', '=', '[', ']', '(', ')', '!', '@'];
        
        // 记录最后一次键盘操作时间
        lastKeyPressTime.current = Date.now();
        
        // 检查是否刚刚完成了组合输入
        const timeSinceLastComposition = Date.now() - lastCompositionEndTime.current;
        const isJustAfterComposition = timeSinceLastComposition < 500; // 增加时间窗口
        
        // 如果编辑器被锁定，立即解锁
        if (isEditorLocked.current) {
            console.log('检测到编辑器锁定状态，立即解锁');
            isEditorLocked.current = false;
            
            // 如果是关键操作键，确保它们能正常工作
            if (e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Delete') {
                // 不阻止默认行为，确保键盘操作正常工作
                return;
            }
        }
        
        // 处理通过数字键选择候选词的情况
        if (isComposing && e.key >= '1' && e.key <= '9') {
            console.log(`组合输入中通过数字键选择候选词: ${e.key}`);
            // 不阻止默认行为，让输入法正常处理
            return;
        }
        
        // 处理可能的输入速度过快导致的Enter键无效问题
        if (e.key === 'Enter') {
            // 检查是否在组合输入中或刚刚完成组合输入
            if ((e.nativeEvent && (e.nativeEvent as any).isComposing) || isJustAfterComposition || isComposing) {
                console.log('检测到Enter键在组合输入期间或刚刚完成组合输入后');
                // 确保编辑器不会锁定Enter键
                isEditorLocked.current = false;
                
                // 如果编辑器存在，尝试手动触发换行
                if (editorEl.current && editorEl.current.view) {
                    // 尝试手动插入换行
                    try {
                        const { state } = editorEl.current.view;
                        const tr = state.tr.insertText('\n');
                        editorEl.current.view.dispatch(tr);
                        
                        // 确保编辑器接收键盘事件
                        if (editorEl.current.element) {
                            editorEl.current.element.focus();
                        }
                        
                        // 阻止默认行为，因为我们已经手动处理了
                        e.preventDefault();
                        e.stopPropagation();
                        
                        // 使用requestAnimationFrame确保在下一帧渲染前刷新编辑器状态
                        requestAnimationFrame(() => {
                            if (editorEl.current && editorEl.current.view) {
                                try {
                                    // 再次确保编辑器状态正确
                                    const { state } = editorEl.current.view;
                                    editorEl.current.view.dispatch(state.tr);
                                    
                                    // 确保编辑器接收键盘事件
                                    if (editorEl.current.element) {
                                        editorEl.current.element.focus();
                                    }
                                } catch (err) {
                                    console.error('RAF中刷新编辑器状态失败', err);
                                }
                            }
                        });
                        
                        return;
                    } catch (err) {
                        console.error('手动插入换行失败', err);
                        // 如果手动插入失败，不阻止默认行为
                    }
                }
                
                // 不阻止默认行为，允许Enter键正常工作
                return;
            }
        }
        
        // 处理中文输入法下输入英文或单个中文词组后无法删除的问题
        if (e.key === 'Backspace' || e.key === 'Delete') {
            // 如果刚刚完成组合输入或编辑器被锁定或正在组合输入
            if (isJustAfterComposition || isEditorLocked.current || isComposing || (e.nativeEvent && (e.nativeEvent as any).isComposing)) {
                console.log(`检测到删除键在组合输入期间或组合输入后: ${e.key}`);
                // 确保编辑器未锁定
                isEditorLocked.current = false;
                
                // 如果编辑器存在，尝试手动触发删除
                if (editorEl.current && editorEl.current.view) {
                    try {
                        const { state } = editorEl.current.view;
                        const { selection } = state;
                        
                        // 如果有选择范围或光标不在文档开始位置
                        if (!selection.empty || selection.$from.pos > 0) {
                            // 创建一个删除前一个字符的事务
                            const tr = state.tr;
                            if (selection.empty) {
                                // 如果没有选择文本，删除光标前的一个字符
                                tr.delete(selection.$from.pos - 1, selection.$from.pos);
                            } else {
                                // 如果有选择文本，删除选择的范围
                                tr.deleteSelection();
                            }
                            editorEl.current.view.dispatch(tr);
                            
                            // 确保编辑器接收键盘事件
                            if (editorEl.current.element) {
                                editorEl.current.element.focus();
                            }
                            
                            // 阻止默认行为，因为我们已经手动处理了
                            e.preventDefault();
                            e.stopPropagation();
                            
                            // 使用requestAnimationFrame确保在下一帧渲染前刷新编辑器状态
                            requestAnimationFrame(() => {
                                if (editorEl.current && editorEl.current.view) {
                                    try {
                                        // 再次确保编辑器状态正确
                                        const { state } = editorEl.current.view;
                                        editorEl.current.view.dispatch(state.tr);
                                        
                                        // 确保编辑器接收键盘事件
                                        if (editorEl.current.element) {
                                            editorEl.current.element.focus();
                                        }
                                    } catch (err) {
                                        console.error('RAF中刷新编辑器状态失败', err);
                                    }
                                }
                            });
                            
                            return;
                        }
                    } catch (err) {
                        console.error('手动删除失败', err);
                        // 如果手动删除失败，不阻止默认行为
                    }
                }
                
                // 确保编辑器能够接收键盘事件
                if (editorEl.current && editorEl.current.element) {
                    // 尝试聚焦编辑器
                    editorEl.current.element.focus();
                }
                
                // 不阻止默认行为，允许删除键正常工作
                return;
            }
        }
        
        // 如果在组合输入状态下按下特殊字符
        if (isComposing && specialChars.includes(e.key)) {
            console.log(`组合输入中检测到特殊字符: ${e.key}`);
            // 阻止默认行为
            e.preventDefault();
            e.stopPropagation();
            
            // 将特殊字符添加到待处理字符串
            pendingChars.current += e.key;
            
            // 如果是斜杠命令，立即在编辑器中显示一个占位符，以便用户知道命令已被捕获
            if (e.key === '/' && editorEl.current && editorEl.current.view) {
                // 在编辑器中显示视觉反馈，但不实际插入字符
                const { state } = editorEl.current.view;
                const { selection } = state;
                
                // 在当前位置显示一个闪烁的光标，提示用户命令已被捕获
                editorEl.current.view.dispatch(state.tr.setSelection(selection));
                
                // 使用requestAnimationFrame确保在下一帧渲染前处理斜杠命令
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
                            console.error('处理斜杠命令失败', err);
                        }
                    }
                });
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
                
                // 确保编辑器接收键盘事件
                if (editorEl.current && editorEl.current.element) {
                    editorEl.current.element.focus();
                }
            } else if (e.key === 'Enter') {
                // 对于Enter键，尝试结束组合输入并插入换行
                setIsComposing(false);
                isEditorLocked.current = false;
                
                // 尝试手动插入换行
                if (editorEl.current && editorEl.current.view) {
                    try {
                        const { state } = editorEl.current.view;
                        const tr = state.tr.insertText('\n');
                        editorEl.current.view.dispatch(tr);
                        
                        // 确保编辑器接收键盘事件
                        if (editorEl.current.element) {
                            editorEl.current.element.focus();
                        }
                    } catch (err) {
                        console.error('组合输入中插入换行失败', err);
                    }
                }
                
                // 阻止默认行为
                e.preventDefault();
                e.stopPropagation();
            } else {
                // 对于其他格式键，阻止默认行为
                e.preventDefault();
                e.stopPropagation();
            }
            return;
        }
        
        // 处理中文输入法下的斜杠键
        if ((!isComposing && e.key === '/' && e.nativeEvent && (e.nativeEvent as any).isComposing) || 
            (isJustAfterComposition && e.key === '/')) {
            console.log('检测到中文输入法下的斜杠键');
            e.preventDefault();
            e.stopPropagation();
            
            // 立即插入斜杠，确保不会被输入法干扰
            if (editorEl.current && editorEl.current.view) {
                try {
                    const { state } = editorEl.current.view;
                    const tr = state.tr.insertText('/');
                    editorEl.current.view.dispatch(tr);
                    
                    // 确保编辑器不会被锁定
                    isEditorLocked.current = false;
                    
                    // 确保编辑器接收键盘事件
                    if (editorEl.current.element) {
                        editorEl.current.element.focus();
                    }
                    
                    // 使用requestAnimationFrame确保在下一帧渲染前处理斜杠命令
                    requestAnimationFrame(() => {
                        if (editorEl.current && editorEl.current.view) {
                            try {
                                // 确保编辑器状态正确
                                const { state } = editorEl.current.view;
                                // 模拟斜杠命令触发
                                editorEl.current.view.dispatch(state.tr.insertText('/'));
                                
                                // 确保编辑器接收键盘事件
                                if (editorEl.current.element) {
                                    editorEl.current.element.focus();
                                }
                            } catch (err) {
                                console.error('处理斜杠命令失败', err);
                            }
                        }
                    });
                    
                    // 强制刷新编辑器状态，确保后续操作可以执行
                    setTimeout(() => {
                        if (editorEl.current && editorEl.current.view) {
                            try {
                                const { state } = editorEl.current.view;
                                editorEl.current.view.dispatch(state.tr);
                                
                                // 确保编辑器接收键盘事件
                                if (editorEl.current.element) {
                                    editorEl.current.element.focus();
                                }
                            } catch (err) {
                                console.error('setTimeout中处理斜杠命令失败', err);
                            }
                        }
                    }, 50);
                } catch (err) {
                    console.error('插入斜杠失败', err);
                }
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
            
            // 检查是否刚刚完成组合输入
            const timeSinceCompositionEnd = Date.now() - lastCompositionEndTime.current;
            const isJustAfterComposition = timeSinceCompositionEnd < 500; // 增加时间窗口
            
            // 如果刚刚完成组合输入且需要处理特殊字符
            if (isJustAfterComposition && needsSpecialCharHandling.current) {
                console.log('刚刚完成组合输入，延迟处理onChange');
                
                // 立即解锁编辑器状态
                isEditorLocked.current = false;
                
                // 使用多层次处理机制确保内容变化被正确处理
                // 第一层：立即处理
                try {
                    // 确保编辑器未锁定
                    isEditorLocked.current = false;
                    // 处理特殊字符
                    if (pendingChars.current) {
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
                    }
                    
                    // 确保编辑器接收键盘事件
                    if (editorEl.current && editorEl.current.element) {
                        editorEl.current.element.focus();
                    }
                } catch (err) {
                    console.error('处理特殊字符失败', err);
                    // 出错时也重置状态，防止卡住
                    needsSpecialCharHandling.current = false;
                    pendingChars.current = "";
                    isEditorLocked.current = false;
                }
                
                // 第二层：使用requestAnimationFrame确保在下一帧渲染前处理
                requestAnimationFrame(() => {
                    try {
                        // 再次确保编辑器未锁定
                        isEditorLocked.current = false;
                        
                        // 确保编辑器状态正确
                        if (editorEl.current && editorEl.current.view) {
                            const { state } = editorEl.current.view;
                            editorEl.current.view.dispatch(state.tr);
                        }
                        
                        // 调用原始onChange处理函数
                        onEditorChange(value);
                        
                        // 确保编辑器接收键盘事件
                        if (editorEl.current && editorEl.current.element) {
                            editorEl.current.element.focus();
                        }
                    } catch (err) {
                        console.error('RAF中处理onChange失败', err);
                        // 出错时也调用原始onChange
                        onEditorChange(value);
                    }
                });
                return;
            }
            
            // 如果刚刚完成组合输入但没有特殊字符需要处理
            if (isJustAfterComposition) {
                // 确保编辑器未锁定
                isEditorLocked.current = false;
                
                // 使用requestAnimationFrame确保在下一帧渲染前处理
                requestAnimationFrame(() => {
                    try {
                        // 确保编辑器状态正确
                        if (editorEl.current && editorEl.current.view) {
                            const { state } = editorEl.current.view;
                            editorEl.current.view.dispatch(state.tr);
                        }
                        
                        // 调用原始onChange处理函数
                        onEditorChange(value);
                        
                        // 确保编辑器接收键盘事件
                        if (editorEl.current && editorEl.current.element) {
                            editorEl.current.element.focus();
                        }
                    } catch (err) {
                        console.error('RAF中处理onChange失败', err);
                        // 出错时也调用原始onChange
                        onEditorChange(value);
                    }
                });
                return;
            }
            
            // 否则正常处理onChange
            onEditorChange(value);
        },
        [isComposing, onEditorChange, handleMarkdownCommand, editorEl]
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
