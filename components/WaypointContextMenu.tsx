import React, { useState } from 'react';
import type { ContextMenuState } from '../hooks/useWaypointOperations';
import { ChevronRight } from 'lucide-react';

interface PathOption {
  id: string;
  label: string;
  displayId: string;
  color: string;
}

interface WaypointContextMenuProps {
  contextMenu: ContextMenuState;
  onInsertAfter: () => void;
  onDelete: () => void;
  onDisconnectAfter: () => void;
  onConnectToPath?: (pathId: string) => void;
  availablePathsToConnect?: PathOption[];
}

export const WaypointContextMenu: React.FC<WaypointContextMenuProps> = ({
  contextMenu,
  onInsertAfter,
  onDelete,
  onDisconnectAfter,
  onConnectToPath,
  availablePathsToConnect = [],
}) => {
  const [showConnectSubmenu, setShowConnectSubmenu] = useState(false);

  const hasAvailablePaths = availablePathsToConnect.length > 0;
  const canDisconnect = !contextMenu.isLastWaypoint;

  return (
    <div
      data-context-menu
      className="fixed bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-[100] py-1 min-w-[180px]"
      style={{ left: contextMenu.x, top: contextMenu.y }}
    >
      <button
        onClick={onInsertAfter}
        className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 hover:text-white transition-colors"
      >
        Insert waypoint after
      </button>
      {canDisconnect && (
        <button
          onClick={onDisconnectAfter}
          className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 hover:text-white transition-colors"
        >
          Disconnect path after
        </button>
      )}
      <button
        onClick={onDelete}
        className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-gray-700 hover:text-red-300 transition-colors"
      >
        Delete waypoint
      </button>

      {contextMenu.isLastWaypoint && hasAvailablePaths && (
        <>
          <div className="border-t border-gray-700 my-1" />
          <div className="relative">
            <button
              onMouseEnter={() => setShowConnectSubmenu(true)}
              onMouseLeave={() => setShowConnectSubmenu(false)}
              className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 hover:text-white transition-colors flex items-center justify-between"
            >
              Connect to path
              <ChevronRight className="w-4 h-4" />
            </button>

            {showConnectSubmenu && (
              <div
                data-context-menu
                onMouseEnter={() => setShowConnectSubmenu(true)}
                onMouseLeave={() => setShowConnectSubmenu(false)}
                className="absolute left-full top-0 ml-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 min-w-[160px]"
              >
                {availablePathsToConnect.map(path => (
                  <button
                    key={path.id}
                    onClick={() => onConnectToPath?.(path.id)}
                    className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 hover:text-white transition-colors flex items-center gap-2"
                  >
                    <div
                      className="w-3 h-3 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: path.color }}
                    />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="truncate">{path.label}</span>
                      <span className="text-xs text-gray-400 truncate">{path.displayId}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
