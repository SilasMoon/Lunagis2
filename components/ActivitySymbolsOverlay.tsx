import React from 'react';
import { PathArtifact, Waypoint } from '../types';
import { logger } from '../utils/logger';
import {
  Drill,
  CirclePause,
  Target,
  Flag,
  Satellite,
  SatelliteDish,
  Sunset,
  BatteryMedium,
  TrafficCone,
  ListChecks,
  Camera,
  SquareActivity,
  Waypoints,
  LucideIcon,
} from 'lucide-react';

const SYMBOL_COMPONENTS: Record<string, LucideIcon> = {
  'sunset': Sunset,
  'battery-medium': BatteryMedium,
  'circle-pause': CirclePause,
  'flag': Flag,
  'target': Target,
  'traffic-cone': TrafficCone,
  'list-checks': ListChecks,
  'camera': Camera,
  'satellite-dish': SatelliteDish,
  'satellite': Satellite,
  'square-activity': SquareActivity,
  'drill': Drill,
  'waypoints': Waypoints,
};

interface ActivitySymbolsOverlayProps {
  artifacts: PathArtifact[];
  proj: proj4.ProjectionDefinition | null;
  viewState: { center: [number, number]; scale: number };
  containerWidth: number;
  containerHeight: number;
  showActivitySymbols: boolean;
}

export const ActivitySymbolsOverlay: React.FC<ActivitySymbolsOverlayProps> = ({
  artifacts,
  proj,
  viewState,
  containerWidth,
  containerHeight,
  showActivitySymbols,
}) => {
  // Validate all required conditions including container dimensions
  if (!showActivitySymbols || !proj || !viewState) return null;
  if (containerWidth <= 0 || containerHeight <= 0) return null;
  if (!viewState.scale || viewState.scale <= 0) return null;

  const projToCanvas = (projCoords: [number, number]): [number, number] | null => {
    // Additional safety check for valid projection coordinates
    if (!projCoords || !Array.isArray(projCoords) || projCoords.length !== 2) {
      return null;
    }
    if (!isFinite(projCoords[0]) || !isFinite(projCoords[1])) {
      return null;
    }

    const dpr = window.devicePixelRatio || 1;
    const canvasX = (projCoords[0] - viewState.center[0]) * viewState.scale * dpr + (containerWidth * dpr) / 2;
    const canvasY = (viewState.center[1] - projCoords[1]) * viewState.scale * dpr + (containerHeight * dpr) / 2;

    // Validate calculated positions
    if (!isFinite(canvasX) || !isFinite(canvasY)) {
      return null;
    }

    return [canvasX / dpr, canvasY / dpr];
  };

  return (
    <div className="absolute inset-0 pointer-events-none">
      {artifacts.map((artifact) => {
        if (!artifact.visible || artifact.type !== 'path') return null;

        return artifact.waypoints.map((waypoint, waypointIndex) => {
          if (!waypoint.activitySymbol) return null;

          try {
            // Validate waypoint has valid geoPosition [lon, lat]
            if (!waypoint.geoPosition ||
                !Array.isArray(waypoint.geoPosition) ||
                waypoint.geoPosition.length !== 2 ||
                !isFinite(waypoint.geoPosition[0]) ||
                !isFinite(waypoint.geoPosition[1])) {
              logger.warn(`ActivitySymbolsOverlay: Waypoint ${waypoint.id} has invalid geoPosition`, waypoint);
              return null;
            }

            const projPos = proj.forward(waypoint.geoPosition) as [number, number];
            if (!projPos || !Array.isArray(projPos) || projPos.length !== 2) {
              logger.warn(`ActivitySymbolsOverlay: Invalid projection result for waypoint ${waypoint.id}`, projPos);
              return null;
            }

            const canvasPos = projToCanvas(projPos);
            if (!canvasPos) {
              logger.warn(`ActivitySymbolsOverlay: Invalid canvas position for waypoint ${waypoint.id}`);
              return null;
            }
            const [canvasX, canvasY] = canvasPos;

            // Calculate perpendicular offset based on outgoing segment IN CANVAS SPACE
            let offsetX = 0;
            let offsetY = -35; // Default: upward

            const offsetDistance = waypoint.activityOffset !== undefined ? waypoint.activityOffset : 35;

            if (artifact.waypoints.length > 1) {
              let directionVector: [number, number] | null = null;

              // First waypoint: use perpendicular to outgoing segment
              if (waypointIndex === 0) {
                const nextWaypoint = artifact.waypoints[1];
                const nextProjPos = proj.forward(nextWaypoint.geoPosition) as [number, number];
                const nextCanvasPos = projToCanvas(nextProjPos);
                if (nextCanvasPos) {
                  const [nextCanvasX, nextCanvasY] = nextCanvasPos;
                  const dx = nextCanvasX - canvasX;
                  const dy = nextCanvasY - canvasY;
                  const magnitude = Math.sqrt(dx * dx + dy * dy);
                  if (magnitude > 0) {
                    const outgoingDir = [dx / magnitude, dy / magnitude];
                    // Perpendicular: rotate 90° counterclockwise
                    directionVector = [-outgoingDir[1], outgoingDir[0]];
                  }
                }
              }
              // Last waypoint: use perpendicular to incoming segment
              else if (waypointIndex === artifact.waypoints.length - 1) {
                const prevWaypoint = artifact.waypoints[waypointIndex - 1];
                const prevProjPos = proj.forward(prevWaypoint.geoPosition) as [number, number];
                const prevCanvasPos = projToCanvas(prevProjPos);
                if (prevCanvasPos) {
                  const [prevCanvasX, prevCanvasY] = prevCanvasPos;
                  const dx = canvasX - prevCanvasX;
                  const dy = canvasY - prevCanvasY;
                  const magnitude = Math.sqrt(dx * dx + dy * dy);
                  if (magnitude > 0) {
                    const incomingDir = [dx / magnitude, dy / magnitude];
                    // Perpendicular: rotate 90° counterclockwise
                    directionVector = [-incomingDir[1], incomingDir[0]];
                  }
                }
              }
              // Middle waypoints: use outer angle bisector
              else {
                const prevWaypoint = artifact.waypoints[waypointIndex - 1];
                const nextWaypoint = artifact.waypoints[waypointIndex + 1];

                const prevProjPos = proj.forward(prevWaypoint.geoPosition) as [number, number];
                const nextProjPos = proj.forward(nextWaypoint.geoPosition) as [number, number];

                const prevCanvasPos = projToCanvas(prevProjPos);
                const nextCanvasPos = projToCanvas(nextProjPos);

                if (prevCanvasPos && nextCanvasPos) {
                  const [prevCanvasX, prevCanvasY] = prevCanvasPos;
                  const [nextCanvasX, nextCanvasY] = nextCanvasPos;

                  // Incoming direction (from previous to current)
                  const dx1 = canvasX - prevCanvasX;
                  const dy1 = canvasY - prevCanvasY;
                  const mag1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

                  // Outgoing direction (from current to next)
                  const dx2 = nextCanvasX - canvasX;
                  const dy2 = nextCanvasY - canvasY;
                  const mag2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

                  if (mag1 > 0 && mag2 > 0) {
                    const incomingDir: [number, number] = [dx1 / mag1, dy1 / mag1];
                    const outgoingDir: [number, number] = [dx2 / mag2, dy2 / mag2];

                    // Calculate angles to determine which side has the larger angle
                    const angleIncoming = Math.atan2(incomingDir[1], incomingDir[0]);
                    const angleOutgoing = Math.atan2(outgoingDir[1], outgoingDir[0]);

                    // Angle difference (normalized to [0, 2π))
                    let angleDiff = angleOutgoing - angleIncoming;
                    if (angleDiff < 0) angleDiff += 2 * Math.PI;

                    // The sum of two unit vectors bisects the angle between them
                    let bisectorX = incomingDir[0] + outgoingDir[0];
                    let bisectorY = incomingDir[1] + outgoingDir[1];

                    // If the CCW angle is < π, the outer (larger) angle is on the other side
                    // So we negate the bisector to point toward the larger angle
                    if (angleDiff < Math.PI) {
                      bisectorX = -bisectorX;
                      bisectorY = -bisectorY;
                    }

                    const bisectorMag = Math.sqrt(bisectorX * bisectorX + bisectorY * bisectorY);

                    if (bisectorMag > 0) {
                      const normalizedBisectorX = bisectorX / bisectorMag;
                      const normalizedBisectorY = bisectorY / bisectorMag;
                      // For middle waypoints, position perpendicular to outer angle bisector (consistent with first/last)
                      // Rotate 90° counterclockwise: (x, y) -> (-y, x)
                      directionVector = [-normalizedBisectorY, normalizedBisectorX];
                    }
                  }
                }
              }

              if (directionVector) {
                offsetX = directionVector[0] * offsetDistance;
                offsetY = directionVector[1] * offsetDistance;
              }
            }

            const size = waypoint.activitySymbolSize || 24;
            const color = waypoint.activitySymbolColor || artifact.color;

            const IconComponent = SYMBOL_COMPONENTS[waypoint.activitySymbol];
            if (!IconComponent) return null;

            // Label is positioned further along the same direction vector
            const labelOffset = size / 2 + 20; // Extra offset for label beyond icon
            const directionVector = offsetX !== 0 || offsetY !== 0
              ? [offsetX / offsetDistance, offsetY / offsetDistance]
              : [0, -1]; // fallback

            // Calculate rotation angle for label (perpendicular to direction vector)
            // Perpendicular = rotate 90° CCW: [-dy, dx]
            const perpX = -directionVector[1];
            const perpY = directionVector[0];
            const rotationAngle = Math.atan2(perpY, perpX) * (180 / Math.PI);

            return (
              <React.Fragment key={`${artifact.id}-${waypoint.id}-activity`}>
                {/* Icon */}
                <div
                  className="absolute"
                  style={{
                    left: `${canvasX + offsetX}px`,
                    top: `${canvasY + offsetY}px`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <IconComponent
                    size={size}
                    color={color}
                    strokeWidth={2}
                  />
                </div>
                {/* Label - positioned further along the same direction */}
                {waypoint.activityLabel && (
                  <div
                    className="absolute"
                    style={{
                      left: `${canvasX + offsetX + directionVector[0] * labelOffset}px`,
                      top: `${canvasY + offsetY + directionVector[1] * labelOffset}px`,
                      transform: `translate(-50%, -50%) rotate(${rotationAngle}deg)`,
                    }}
                  >
                    <span
                      className="text-xs font-semibold whitespace-nowrap"
                      style={{
                        color,
                        textShadow: '0 0 3px rgba(0,0,0,0.8), 0 0 3px rgba(0,0,0,0.8)',
                      }}
                    >
                      {waypoint.activityLabel}
                    </span>
                  </div>
                )}
              </React.Fragment>
            );
          } catch (e) {
            logger.error(`ActivitySymbolsOverlay: Error rendering activity symbol for waypoint ${waypoint.id}:`, e);
            return null;
          }
        });
      })}
    </div>
  );
};
