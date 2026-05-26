import { BeltColor } from '@/shared/lib/belt-visuals';

export interface BeltGraphicProps {
  /** Base belt gradient */
  gradient: BeltColor;
  /** Black rectangle near right end (kyu odd levels) */
  badge?: boolean;
  /** Vertical stripe near right end (mon odd levels) */
  stripe?: BeltColor;
  /** Horizontal center line — plain color or gradient */
  midLine?: BeltColor;
  /** Whether midLine uses a gradient or flat color */
  midLineGradient?: boolean;
  /** Colored top half overlay (shogo belts) */
  overlayTopHalf?: BeltColor;
  className?: string;
}

const GRADIENTS: Record<BeltColor, string> = {
  yellow:  'linear-gradient(to bottom, #FFDF00, #FFBF00)',
  magenta: 'linear-gradient(to bottom, #AC92EC, #967ADC)',
  green:   'linear-gradient(to bottom, #209920, #1B601C)',
  brown:   'linear-gradient(to bottom, #AF6F09, #704A07)',
  black:   'linear-gradient(to bottom, #333333, #111111)',
  white:   'linear-gradient(to bottom, #fefefe, #fdfdfd)',
};

const FLAT_COLORS: Record<BeltColor, string> = {
  yellow:  '#FFDF00',
  magenta: '#AC92EC',
  green:   '#209920',
  brown:   '#AF6F09',
  black:   '#000000',
  white:   '#ffffff',
};

export function BeltGraphic({
  gradient,
  badge,
  stripe,
  midLine,
  midLineGradient,
  overlayTopHalf,
  className = '',
}: BeltGraphicProps) {
  return (
    <div
      className={`relative shadow-lg rounded-sm flex flex-row justify-end ${className}`}
      style={{ height: 21, backgroundImage: GRADIENTS[gradient] }}
    >
      {overlayTopHalf && (
        <div
          className="absolute top-0 left-0 w-full rounded-t-sm"
          style={{ height: 10, backgroundColor: FLAT_COLORS[overlayTopHalf] }}
        />
      )}

      {midLine && (
        <div
          className="absolute left-0 w-full self-center"
          style={{
            height: 6,
            top: '50%',
            transform: 'translateY(-50%)',
            ...(midLineGradient
              ? { backgroundImage: GRADIENTS[midLine] }
              : { backgroundColor: FLAT_COLORS[midLine] }),
          }}
        />
      )}

      {stripe && (
        <div
          className="absolute top-0 right-3"
          style={{ width: 7, height: 21, backgroundColor: FLAT_COLORS[stripe] }}
        />
      )}

      {badge && (
        <div
          className="absolute top-[2px] right-3 rounded-sm"
          style={{
            width: '20%',
            minWidth: 15,
            maxWidth: 35,
            height: 17,
            backgroundColor: '#000000',
          }}
        />
      )}
    </div>
  );
}
