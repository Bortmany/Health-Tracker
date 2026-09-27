import styles from './BodyHeatmap.module.css';

// A stylized flat human silhouette (front or back) with tappable muscle
// regions that color by training heat. Deliberately a simple glyph, not an
// anatomy chart — the point is "which areas lit up", at a glance.
//
// Symmetric muscles (both biceps, both quads, ...) are ONE path made of two
// subpaths, so the left and right sides always light up together.

// The base body outline. Mirrored around x=100 inside a 200x420 viewBox:
// head sits at the top, arms hang slightly away from the torso, feet at the
// bottom. The same glyph works for the front and the back view.
const BODY_OUTLINE =
  'M90,44 L88,60 Q70,64 58,72 Q46,80 44,96 L38,160 L34,208 Q32,224 38,232 ' +
  'Q46,236 48,224 L50,208 L56,158 L62,116 Q64,112 66,112 Q68,150 70,168 ' +
  'Q64,190 62,210 L60,240 L66,300 Q72,315 72,330 L74,382 L64,396 Q62,404 68,406 ' +
  'L94,406 Q96,400 94,388 L88,335 L90,300 Q94,260 98,236 L100,226 L102,236 ' +
  'Q106,260 110,300 L112,335 L106,388 Q104,400 106,406 L132,406 Q138,404 136,396 ' +
  'L126,382 L128,330 Q128,315 134,300 L140,240 L138,210 Q136,190 130,168 ' +
  'Q132,150 134,112 Q136,112 138,116 L144,158 L150,208 L152,224 Q154,236 162,232 ' +
  'Q168,224 166,208 L162,160 L156,96 Q154,80 142,72 Q130,64 112,60 L110,44 Z';

// Muscle regions per view. Each `d` with two "M...Z" subpaths is a symmetric
// pair (left half + right half mirrored around x=100).
const REGIONS = {
  front: [
    {
      id: 'traps',
      label: 'Traps',
      d: 'M84,62 L84,70 L71,77 L67,71 Z M116,62 L116,70 L129,77 L133,71 Z',
    },
    {
      id: 'front-delts',
      label: 'Front shoulders',
      d: 'M57,77 Q66,75 66,89 Q64,101 55,102 Q52,88 57,77 Z M143,77 Q134,75 134,89 Q136,101 145,102 Q148,88 143,77 Z',
    },
    {
      id: 'side-delts',
      label: 'Side shoulders',
      d: 'M52,82 Q46,88 45,98 Q47,107 52,104 Q54,93 52,82 Z M148,82 Q154,88 155,98 Q153,107 148,104 Q146,93 148,82 Z',
    },
    {
      id: 'chest',
      label: 'Chest',
      d: 'M72,82 L98,82 L98,116 Q84,122 70,108 Z M128,82 L102,82 L102,116 Q116,122 130,108 Z',
    },
    {
      id: 'biceps',
      label: 'Biceps',
      d: 'M46,114 Q57,109 58,120 L54,150 Q47,154 43,145 Z M154,114 Q143,109 142,120 L146,150 Q153,154 157,145 Z',
    },
    {
      id: 'forearms',
      label: 'Forearms',
      d: 'M42,164 L53,161 L49,203 L39,201 Z M158,164 L147,161 L151,203 L161,201 Z',
    },
    {
      id: 'abs',
      label: 'Abs',
      d: 'M85,127 L115,127 Q116,182 100,190 Q84,182 85,127 Z',
    },
    {
      id: 'obliques',
      label: 'Obliques',
      d: 'M71,124 L82,128 L82,174 Q74,164 70,144 Z M129,124 L118,128 L118,174 Q126,164 130,144 Z',
    },
    {
      id: 'quads',
      label: 'Quads',
      d: 'M66,222 Q81,212 96,230 L93,288 Q79,297 68,288 Z M134,222 Q119,212 104,230 L107,288 Q121,297 132,288 Z',
    },
    {
      id: 'calves',
      label: 'Calves',
      d: 'M75,312 Q81,306 87,312 L85,368 L77,368 Z M125,312 Q119,306 113,312 L115,368 L123,368 Z',
    },
  ],
  back: [
    {
      id: 'traps',
      label: 'Traps',
      d: 'M88,60 L112,60 L122,74 Q110,96 100,103 Q90,96 78,74 Z',
    },
    {
      id: 'rear-delts',
      label: 'Rear shoulders',
      d: 'M57,77 Q66,75 66,89 Q64,101 55,102 Q52,88 57,77 Z M143,77 Q134,75 134,89 Q136,101 145,102 Q148,88 143,77 Z',
    },
    {
      id: 'side-delts',
      label: 'Side shoulders',
      d: 'M52,82 Q46,88 45,98 Q47,107 52,104 Q54,93 52,82 Z M148,82 Q154,88 155,98 Q153,107 148,104 Q146,93 148,82 Z',
    },
    {
      id: 'triceps',
      label: 'Triceps',
      d: 'M46,114 Q57,109 58,120 L54,150 Q47,154 43,145 Z M154,114 Q143,109 142,120 L146,150 Q153,154 157,145 Z',
    },
    {
      id: 'forearms',
      label: 'Forearms',
      d: 'M42,164 L53,161 L49,203 L39,201 Z M158,164 L147,161 L151,203 L161,201 Z',
    },
    {
      id: 'lats',
      label: 'Lats',
      d: 'M69,112 Q82,120 96,122 L96,154 Q80,168 72,152 Q67,130 69,112 Z M131,112 Q118,120 104,122 L104,154 Q120,168 128,152 Q133,130 131,112 Z',
    },
    {
      id: 'lower-back',
      label: 'Lower back',
      d: 'M88,158 L112,158 L110,190 Q100,196 90,190 Z',
    },
    {
      id: 'glutes',
      label: 'Glutes',
      d: 'M69,196 Q83,190 98,198 L98,228 Q82,238 67,224 Z M131,196 Q117,190 102,198 L102,228 Q118,238 133,224 Z',
    },
    {
      id: 'hamstrings',
      label: 'Hamstrings',
      d: 'M67,242 L94,242 L91,294 Q78,301 69,290 Z M133,242 L106,242 L109,294 Q122,301 131,290 Z',
    },
    {
      id: 'calves',
      label: 'Calves',
      d: 'M74,310 Q81,303 87,310 Q90,338 85,368 L77,368 Q71,336 74,310 Z M126,310 Q119,303 113,310 Q110,338 115,368 L123,368 Q129,336 126,310 Z',
    },
  ],
};

// Heat buckets: 0 stays cold (surface color), then four steps up to "hot".
function heatClass(intensity) {
  if (intensity >= 76) return styles.heat4;
  if (intensity >= 51) return styles.heat3;
  if (intensity >= 26) return styles.heat2;
  if (intensity >= 1) return styles.heat1;
  return styles.heat0;
}

export default function BodyHeatmap({ view = 'front', intensities = {}, selected, onSelect }) {
  const regions = REGIONS[view] ?? [];

  return (
    <svg
      viewBox="0 0 200 420"
      className={styles.svg}
      role="group"
      aria-label={view === 'front' ? 'Front of the body' : 'Back of the body'}
    >
      <path className={styles.silhouette} d={BODY_OUTLINE} />
      <circle className={styles.silhouette} cx="100" cy="28" r="18" />
      {regions.map(({ id, label, d }) => {
        const intensity = Math.max(0, Math.min(100, Math.round(intensities[id] ?? 0)));
        const isSelected = selected === id;
        return (
          <path
            key={id}
            d={d}
            className={`${styles.region} ${heatClass(intensity)} ${isSelected ? styles.selected : ''}`.trim()}
            role="button"
            tabIndex={0}
            aria-label={`${label}: heat ${intensity} out of 100`}
            aria-pressed={isSelected}
            onClick={() => onSelect?.(id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect?.(id);
              }
            }}
          />
        );
      })}
    </svg>
  );
}
