import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Artifact, Waypoint, PathArtifact } from '../types';
import { generateSecureId } from '../utils/crypto';

export interface ContextMenuState {
  x: number;
  y: number;
  artifactId: string;
  waypointId: string;
  isLastWaypoint: boolean;
}

interface UseWaypointOperationsProps {
  artifacts: Artifact[];
  hoveredWaypointInfo: { artifactId: string; waypointId: string } | null;
  onUpdateArtifact: (id: string, updates: Partial<Artifact>) => void;
  onDeleteArtifact: (id: string) => void;
  onAddArtifact: (artifact: Artifact) => void;
}

export function useWaypointOperations({
  artifacts,
  hoveredWaypointInfo,
  onUpdateArtifact,
  onDeleteArtifact,
  onAddArtifact,
}: UseWaypointOperationsProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Handle right-click context menu for waypoints
  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!hoveredWaypointInfo) {
      setContextMenu(null);
      return;
    }

    // Find the artifact and waypoint to determine if it's the last waypoint
    const artifact = artifacts.find(a => a.id === hoveredWaypointInfo.artifactId);
    if (!artifact || artifact.type !== 'path') {
      setContextMenu(null);
      return;
    }

    const waypointIndex = artifact.waypoints.findIndex(wp => wp.id === hoveredWaypointInfo.waypointId);
    const isLastWaypoint = waypointIndex === artifact.waypoints.length - 1;

    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      artifactId: hoveredWaypointInfo.artifactId,
      waypointId: hoveredWaypointInfo.waypointId,
      isLastWaypoint,
    });
  }, [hoveredWaypointInfo, artifacts]);

  // Insert a new waypoint after the selected one
  const handleInsertWaypointAfter = useCallback(() => {
    if (!contextMenu) return;

    const artifact = artifacts.find(a => a.id === contextMenu.artifactId);
    if (!artifact || artifact.type !== 'path') {
      setContextMenu(null);
      return;
    }

    const waypointIndex = artifact.waypoints.findIndex(wp => wp.id === contextMenu.waypointId);
    if (waypointIndex === -1) {
      setContextMenu(null);
      return;
    }

    const currentWaypoint = artifact.waypoints[waypointIndex];
    const isLastWaypoint = waypointIndex === artifact.waypoints.length - 1;

    let newGeoPosition: [number, number];
    let newLabel: string;

    if (isLastWaypoint) {
      // If it's the last waypoint, place the new one slightly offset
      // Use a small offset in the same direction as the last segment, or default offset
      if (waypointIndex > 0) {
        const prevWaypoint = artifact.waypoints[waypointIndex - 1];
        const dx = currentWaypoint.geoPosition[0] - prevWaypoint.geoPosition[0];
        const dy = currentWaypoint.geoPosition[1] - prevWaypoint.geoPosition[1];
        newGeoPosition = [
          currentWaypoint.geoPosition[0] + dx * 0.5,
          currentWaypoint.geoPosition[1] + dy * 0.5
        ];
      } else {
        // Only one waypoint, offset slightly
        newGeoPosition = [
          currentWaypoint.geoPosition[0] + 0.001,
          currentWaypoint.geoPosition[1] + 0.001
        ];
      }
      newLabel = `WP${artifact.waypoints.length + 1}`;
    } else {
      // Insert halfway between current and next waypoint
      const nextWaypoint = artifact.waypoints[waypointIndex + 1];
      newGeoPosition = [
        (currentWaypoint.geoPosition[0] + nextWaypoint.geoPosition[0]) / 2,
        (currentWaypoint.geoPosition[1] + nextWaypoint.geoPosition[1]) / 2
      ];
      // Generate label based on position
      newLabel = `WP${waypointIndex + 2}`;
    }

    // Create the new waypoint
    const newWaypoint: Waypoint = {
      id: generateSecureId('waypoint'),
      geoPosition: newGeoPosition,
      label: newLabel,
    };

    // Insert the new waypoint after the current one
    const newWaypoints = [...artifact.waypoints];
    newWaypoints.splice(waypointIndex + 1, 0, newWaypoint);

    // Relabel waypoints to maintain sequential order
    const relabeledWaypoints = newWaypoints.map((wp, idx) => ({
      ...wp,
      label: `WP${idx + 1}`
    }));

    onUpdateArtifact(artifact.id, { waypoints: relabeledWaypoints });
    setContextMenu(null);
  }, [contextMenu, artifacts, onUpdateArtifact]);

  // Delete a waypoint from the path
  const handleDeleteWaypoint = useCallback(() => {
    if (!contextMenu) return;

    const artifact = artifacts.find(a => a.id === contextMenu.artifactId);
    if (!artifact || artifact.type !== 'path') {
      setContextMenu(null);
      return;
    }

    // Don't allow deleting if only one waypoint remains
    if (artifact.waypoints.length <= 1) {
      setContextMenu(null);
      return;
    }

    const waypointIndex = artifact.waypoints.findIndex(wp => wp.id === contextMenu.waypointId);
    if (waypointIndex === -1) {
      setContextMenu(null);
      return;
    }

    // Remove the waypoint
    const newWaypoints = artifact.waypoints.filter(wp => wp.id !== contextMenu.waypointId);

    // Relabel remaining waypoints
    const relabeledWaypoints = newWaypoints.map((wp, idx) => ({
      ...wp,
      label: `WP${idx + 1}`
    }));

    onUpdateArtifact(artifact.id, { waypoints: relabeledWaypoints });
    setContextMenu(null);
  }, [contextMenu, artifacts, onUpdateArtifact]);

  // Disconnect path after the selected waypoint (split into two paths)
  const handleDisconnectAfter = useCallback(() => {
    if (!contextMenu) return;

    const artifact = artifacts.find(a => a.id === contextMenu.artifactId);
    if (!artifact || artifact.type !== 'path') {
      setContextMenu(null);
      return;
    }

    const waypointIndex = artifact.waypoints.findIndex(wp => wp.id === contextMenu.waypointId);
    if (waypointIndex === -1 || waypointIndex === artifact.waypoints.length - 1) {
      // Can't disconnect after the last waypoint
      setContextMenu(null);
      return;
    }

    // Split waypoints: keep up to and including current waypoint in original path
    const firstPathWaypoints = artifact.waypoints.slice(0, waypointIndex + 1);
    const secondPathWaypoints = artifact.waypoints.slice(waypointIndex + 1);

    // Relabel first path waypoints
    const relabeledFirstPath = firstPathWaypoints.map((wp, idx) => ({
      ...wp,
      label: `WP${idx + 1}`
    }));

    // Create new path with remaining waypoints
    const pathNumbers = artifacts
      .filter(a => a.type === 'path')
      .map(a => {
        const match = a.id.match(/^path-(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      });
    const nextPathNumber = pathNumbers.length > 0 ? Math.max(...pathNumbers) + 1 : 1;

    const newPath: PathArtifact = {
      id: `path-${nextPathNumber}`,
      type: 'path',
      name: `Path ${nextPathNumber}`,
      visible: true,
      color: artifact.color,
      thickness: artifact.thickness,
      waypoints: secondPathWaypoints.map((wp, idx) => ({
        ...wp,
        label: `WP${idx + 1}`
      }))
    };

    // Update original path with first half
    onUpdateArtifact(artifact.id, { waypoints: relabeledFirstPath });

    // Add new path with second half
    onAddArtifact(newPath);

    setContextMenu(null);
  }, [contextMenu, artifacts, onUpdateArtifact, onAddArtifact]);

  // Get available paths to connect to (only other paths, not the current one)
  const availablePathsToConnect = useMemo(() => {
    if (!contextMenu || !contextMenu.isLastWaypoint) return [];

    return artifacts
      .filter((a): a is PathArtifact =>
        a.type === 'path' &&
        a.id !== contextMenu.artifactId &&
        a.visible
      )
      .map(path => ({
        id: path.id,
        label: path.name,
        displayId: path.id,
        color: path.color,
      }));
  }, [contextMenu, artifacts]);

  // Connect the last waypoint of current path to the first waypoint of target path
  const handleConnectToPath = useCallback((targetPathId: string) => {
    if (!contextMenu) return;

    const currentArtifact = artifacts.find(a => a.id === contextMenu.artifactId);
    const targetArtifact = artifacts.find(a => a.id === targetPathId);

    if (!currentArtifact || currentArtifact.type !== 'path' ||
        !targetArtifact || targetArtifact.type !== 'path') {
      setContextMenu(null);
      return;
    }

    // Merge the paths: current path waypoints + target path waypoints
    const mergedWaypoints = [
      ...currentArtifact.waypoints,
      ...targetArtifact.waypoints
    ];

    // Relabel all waypoints
    const relabeledWaypoints = mergedWaypoints.map((wp, idx) => ({
      ...wp,
      label: `WP${idx + 1}`
    }));

    // Update the current artifact with merged waypoints
    onUpdateArtifact(currentArtifact.id, { waypoints: relabeledWaypoints });

    // Delete the target artifact since it's been merged
    onDeleteArtifact(targetPathId);

    setContextMenu(null);
  }, [contextMenu, artifacts, onUpdateArtifact, onDeleteArtifact]);

  // Close context menu when clicking elsewhere or pressing Escape
  useEffect(() => {
    if (!contextMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      // Don't close if clicking inside the context menu
      const target = e.target as HTMLElement;
      if (target.closest('[data-context-menu]')) return;
      setContextMenu(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
      }
    };

    // Use setTimeout to avoid the current event from triggering close
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  return {
    contextMenu,
    setContextMenu,
    handleContextMenu,
    handleInsertWaypointAfter,
    handleDeleteWaypoint,
    handleDisconnectAfter,
    handleConnectToPath,
    availablePathsToConnect,
  };
}
