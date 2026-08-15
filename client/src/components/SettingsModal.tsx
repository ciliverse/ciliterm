import { useState } from 'react';
import { useSettings } from '../settings/settings';
import { BUILTIN_THEMES, parseCustomTheme } from '../theme/themes';
import {
  DEFAULT_LAYOUT,
  hiddenModules,
  hideModule,
  moduleLabel,
  moveModule,
  openCenterTerminal,
  type Layout,
  type ModuleId,
  type SlotId,
} from '../layout/layout';

function reorder(col: ModuleId[], from: number, to: number): ModuleId[] {
  const a = col.slice();
  const [x] = a.splice(from, 1);
  a.splice(to, 0, x);
  return a;
}

function LayoutEditor({
  layout,
  onChange,
}: {
  layout: Layout;
  onChange: (l: Layout) => void;
}) {
  const slots: SlotId[] = ['left', 'right', 'header', 'center'];
  const hidden = hiddenModules(layout);

  return (
    <div className="field">
      <label>Layout (drag panels in the UI, or arrange here)</label>
      {slots.map((side) => (
        <div key={side} className="lay-edit-col">
          <div className="sub">{side}</div>
          {layout[side].length === 0 && <div className="metric-row">empty</div>}
          {layout[side].map((id, i) => (
            <div key={id} className="lay-edit-row">
              <span className="name">{moduleLabel(id)}</span>
              <span className="row-actions">
                <button
                  className="mini-btn"
                  disabled={i === 0}
                  onClick={() => onChange({ ...layout, [side]: reorder(layout[side], i, i - 1) })}
                >
                  ↑
                </button>
                <button
                  className="mini-btn"
                  disabled={i === layout[side].length - 1}
                  onClick={() => onChange({ ...layout, [side]: reorder(layout[side], i, i + 1) })}
                >
                  ↓
                </button>
                <button
                  className="mini-btn"
                  title="move to other column"
                  onClick={() =>
                    onChange(
                      moveModule(
                        layout,
                        id,
                        side === 'left' ? 'right' : 'left',
                        Number.MAX_SAFE_INTEGER,
                      ),
                    )
                  }
                >
                  {side === 'left' ? '→' : side === 'right' ? '←' : '↕'}
                </button>
                <button className="mini-btn danger" onClick={() => onChange(hideModule(layout, id))}>
                  ✕
                </button>
              </span>
            </div>
          ))}
        </div>
      ))}
      {hidden.length > 0 && (
        <div className="lay-edit-col">
          <div className="sub">hidden</div>
          {hidden.map((id) => (
            <div key={id} className="lay-edit-row">
              <span className="name">{moduleLabel(id)}</span>
              <span className="row-actions">
                <button
                  className="mini-btn"
                  onClick={() => onChange(moveModule(layout, id, 'left', Number.MAX_SAFE_INTEGER))}
                >
                  + left
                </button>
                <button
                  className="mini-btn"
                  onClick={() => onChange(moveModule(layout, id, 'right', Number.MAX_SAFE_INTEGER))}
                >
                  + right
                </button>
                {id === 'clock' && (
                  <button
                    className="mini-btn"
                    onClick={() => onChange(moveModule(layout, id, 'header', 0))}
                  >
                    + header
                  </button>
                )}
                <button
                  className="mini-btn"
                  onClick={() =>
                    onChange(
                      id === 'terminal'
                        ? openCenterTerminal(layout, window.innerWidth)
                        : moveModule(layout, id, 'center', Number.MAX_SAFE_INTEGER),
                    )
                  }
                >
                  + center
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
      <button className="mini-btn" onClick={() => onChange(DEFAULT_LAYOUT)}>
        reset layout
      </button>
    </div>
  );
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { settings, update } = useSettings();
  const [themeJson, setThemeJson] = useState('');
  const [themeErr, setThemeErr] = useState('');
  const [presetName, setPresetName] = useState('');

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const others = settings.layoutPresets.filter((p) => p.name !== name);
    update({ layoutPresets: [...others, { name, layout: settings.layout }] });
    setPresetName('');
  };

  const addCustomTheme = () => {
    try {
      const theme = parseCustomTheme(themeJson);
      const others = settings.customThemes.filter((t) => t.id !== theme.id);
      update({ customThemes: [...others, theme], themeId: theme.id });
      setThemeJson('');
      setThemeErr('');
    } catch (e) {
      setThemeErr(e instanceof Error ? e.message : 'invalid theme JSON');
    }
  };

  const removeCustomTheme = (id: string) => {
    const next = settings.customThemes.filter((t) => t.id !== id);
    update({
      customThemes: next,
      themeId: settings.themeId === id ? BUILTIN_THEMES[0].id : settings.themeId,
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3>SETTINGS</h3>
        <div className="field">
          <label>Theme</label>
          <div className="theme-swatches">
            {BUILTIN_THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`theme-swatch ${settings.themeId === t.id ? 'active' : ''}`}
                title={t.name}
                onClick={() => update({ themeId: t.id })}
                style={{
                  background: `linear-gradient(135deg, ${t.colors.bg} 40%, ${t.colors.primary} 100%)`,
                  borderColor: t.colors.primary,
                }}
              >
                <span>{t.name.split(' ')[0]}</span>
              </button>
            ))}
            {settings.customThemes.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`theme-swatch ${settings.themeId === t.id ? 'active' : ''}`}
                title={t.name}
                onClick={() => update({ themeId: t.id })}
                style={{
                  background: `linear-gradient(135deg, ${t.colors.bg} 40%, ${t.colors.primary} 100%)`,
                  borderColor: t.colors.primary,
                }}
              >
                <span>{t.name.split(' ')[0]}</span>
              </button>
            ))}
          </div>
          <select value={settings.themeId} onChange={(e) => update({ themeId: e.target.value })}>
            {BUILTIN_THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            {settings.customThemes.length > 0 && (
              <optgroup label="Custom">
                {settings.customThemes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        {settings.customThemes.length > 0 && (
          <div className="field">
            <label>Custom themes</label>
            <div className="list" style={{ maxHeight: 90 }}>
              {settings.customThemes.map((t) => (
                <div key={t.id} className="list-item">
                  <span className="name">{t.name}</span>
                  <button className="mini-btn danger" onClick={() => removeCustomTheme(t.id)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="field">
          <label>Add theme plugin (paste JSON)</label>
          <textarea
            rows={4}
            spellCheck={false}
            value={themeJson}
            placeholder='{"id":"my","name":"My Theme","colors":{"bg":"#0a0a0a","bgPanel":"rgba(20,20,20,0.72)","bgPanelSolid":"#111","primary":"#ff5cf0","primaryDim":"#8a2e80","secondary":"#5cffd0","red":"#ff5470","green":"#7dffb0","text":"#f0e8ff","textDim":"#9a7fb0"}}'
            onChange={(e) => setThemeJson(e.target.value)}
          />
          {themeErr && (
            <div className="metric-row" style={{ color: 'var(--orange)' }}>
              {themeErr}
            </div>
          )}
          <button className="mini-btn" disabled={!themeJson.trim()} onClick={addCustomTheme}>
            add theme
          </button>
        </div>
        <LayoutEditor layout={settings.layout} onChange={(layout) => update({ layout })} />
        <div className="field">
          <label>Layout presets</label>
          {settings.layoutPresets.length > 0 && (
            <div className="list" style={{ maxHeight: 120 }}>
              {settings.layoutPresets.map((p) => (
                <div key={p.name} className="list-item">
                  <span className="name">{p.name}</span>
                  <span className="row-actions">
                    <button className="mini-btn" onClick={() => update({ layout: p.layout })}>
                      apply
                    </button>
                    <button
                      className="mini-btn danger"
                      onClick={() =>
                        update({
                          layoutPresets: settings.layoutPresets.filter((x) => x.name !== p.name),
                        })
                      }
                    >
                      ✕
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="preset-add">
            <input
              placeholder="preset name"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
            />
            <button className="mini-btn" disabled={!presetName.trim()} onClick={savePreset}>
              save current
            </button>
          </div>
        </div>
        <div className="field">
          <label>Font family</label>
          <input
            value={settings.fontFamily}
            onChange={(e) => update({ fontFamily: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Font size: {settings.fontSize}px</label>
          <input
            type="range"
            min={10}
            max={22}
            value={settings.fontSize}
            onChange={(e) => update({ fontSize: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>Metrics interval: {settings.sysIntervalMs}ms</label>
          <input
            type="range"
            min={500}
            max={5000}
            step={500}
            value={settings.sysIntervalMs}
            onChange={(e) => update({ sysIntervalMs: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={settings.includeProcesses}
              onChange={(e) => update({ includeProcesses: e.target.checked })}
            />{' '}
            Poll process list (heavier)
          </label>
        </div>
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={settings.lowPowerGlobe}
              onChange={(e) => update({ lowPowerGlobe: e.target.checked })}
            />{' '}
            Low-power globe (30fps)
          </label>
        </div>
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={settings.rawPaste}
              onChange={(e) => update({ rawPaste: e.target.checked })}
            />{' '}
            Raw paste (fixes ^[[200~ on some shells)
          </label>
        </div>
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={settings.bootScreen}
              onChange={(e) => update({ bootScreen: e.target.checked })}
            />{' '}
            Show boot screen on load
          </label>
        </div>
        <div className="field">
          <label>CRT intensity: {settings.crtIntensity}%</label>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={settings.crtIntensity}
            onChange={(e) => update({ crtIntensity: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={settings.motion}
              onChange={(e) => update({ motion: e.target.checked })}
            />{' '}
            UI motion (brand pulse, panel enter, alert flash)
          </label>
        </div>
        <div className="modal-actions">
          <button className="mini-btn" onClick={onClose}>
            close
          </button>
        </div>
      </div>
    </div>
  );
}
