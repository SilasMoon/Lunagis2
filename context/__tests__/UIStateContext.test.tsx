import { renderHook, act } from '@testing-library/react';
import { UIStateProvider, useUIStateContext } from '../UIStateContext';
import type { Tool } from '../../types';

describe('UIStateContext', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <UIStateProvider>{children}</UIStateProvider>
    );

    describe('Tool Selection', () => {
        it('should initialize with layers tool selected', () => {
            const { result } = renderHook(() => useUIStateContext(), { wrapper });
            expect(result.current.activeTool).toBe('layers');
        });

        it('should change active tool', () => {
            const { result } = renderHook(() => useUIStateContext(), { wrapper });

            act(() => {
                result.current.onToolSelect('artifacts' as Tool);
            });

            expect(result.current.activeTool).toBe('artifacts');
        });

        it('should stop flickering when changing tools', () => {
            const { result } = renderHook(() => useUIStateContext(), { wrapper });

            // Start flickering
            act(() => {
                result.current.onToggleFlicker('layer-123');
            });

            expect(result.current.flickeringLayerId).toBe('layer-123');

            // Change tool
            act(() => {
                result.current.onToolSelect('time' as Tool);
            });

            expect(result.current.flickeringLayerId).toBeNull();
        });
    });

    describe('Flicker Animation', () => {
        it('should start flickering a layer', () => {
            const { result } = renderHook(() => useUIStateContext(), { wrapper });

            act(() => {
                result.current.onToggleFlicker('layer-123');
            });

            expect(result.current.flickeringLayerId).toBe('layer-123');
        });

        it('should stop flickering when toggled again', () => {
            const { result } = renderHook(() => useUIStateContext(), { wrapper });

            act(() => {
                result.current.onToggleFlicker('layer-123');
            });

            expect(result.current.flickeringLayerId).toBe('layer-123');

            act(() => {
                result.current.onToggleFlicker('layer-123');
            });

            expect(result.current.flickeringLayerId).toBeNull();
        });

        it('should switch flickering to another layer', () => {
            const { result } = renderHook(() => useUIStateContext(), { wrapper });

            act(() => {
                result.current.onToggleFlicker('layer-123');
            });

            expect(result.current.flickeringLayerId).toBe('layer-123');

            act(() => {
                result.current.onToggleFlicker('layer-456');
            });

            expect(result.current.flickeringLayerId).toBe('layer-456');
        });
    });

    describe('Import/Export State', () => {
        it('should manage import request', () => {
            const { result } = renderHook(() => useUIStateContext(), { wrapper });

            const mockRequest = {
                config: {} as any,
                requiredFiles: ['file1.npy', 'file2.npy'],
            };

            act(() => {
                result.current.setImportRequest(mockRequest);
            });

            expect(result.current.importRequest).toEqual(mockRequest);
        });

        it('should clear import request', () => {
            const { result } = renderHook(() => useUIStateContext(), { wrapper });

            const mockRequest = {
                config: {} as any,
                requiredFiles: ['file1.npy'],
            };

            act(() => {
                result.current.setImportRequest(mockRequest);
                result.current.setImportRequest(null);
            });

            expect(result.current.importRequest).toBeNull();
        });
    });

    describe('Expression Creation', () => {
        it('should toggle expression creation mode', () => {
            const { result } = renderHook(() => useUIStateContext(), { wrapper });

            expect(result.current.isCreatingExpression).toBe(false);

            act(() => {
                result.current.setIsCreatingExpression(true);
            });

            expect(result.current.isCreatingExpression).toBe(true);
        });
    });
});
