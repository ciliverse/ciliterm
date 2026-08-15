import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeoData, GeoPoint } from '@ciliterm/shared';
import { EncomGlobe } from './encomGlobe';
import { getSys } from '../../transport/clients';
import { useSettings } from '../../settings/settings';
import { useTabs } from '../Terminal/tabsStore';
import { findTabForHost, resolveGlobeAction } from './globeActions';
import { formatGlobePin, rankHudRows, summarizeLive } from './globeHud';
import { geoPointKey } from './geoDiff';
import { isShowcase } from '../../showcase';

const KIND_LABEL: Record<GeoPoint['kind'], string> = {
  self: 'this machine',
  ssh: 'ssh host',
  conn: 'live connection',
};

function shortLabel(p: GeoPoint): string {
  return p.label.split(' · ')[0] ?? p.label;
}

export function Globe({ lowPower }: { lowPower: boolean }) {
  const { settings } = useSettings();
  const { tabs, setActiveTab, connectHost } = useTabs();
  const holderRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<EncomGlobe | null>(null);
  const [selected, setSelected] = useState<GeoPoint | null>(null);
  const [geo, setGeo] = useState<GeoData>({ self: null, points: [], arcs: [] });
  const showcase = isShowcase();

  const openHostIds = tabs.flatMap((tab) =>
    tab.panes.map((p) => p.create?.hostId).filter((id): id is string => !!id),
  );

  useEffect(() => {
    if (!holderRef.current) return;
    const globe = new EncomGlobe(holderRef.current, lowPower);
    globeRef.current = globe;
    globe.setSelectHandler(setSelected);
    globe.start();

    const sys = getSys();
    const offMsg = sys.onMessage((msg) => {
      if (msg.t === 'geo') {
        globe.setData(msg.data);
        setGeo(msg.data);
      }
    });
    sys.send({ t: 'geo.request' });

    const onVisibility = () => {
      if (document.hidden) globe.stop();
      else globe.start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      offMsg();
      document.removeEventListener('visibilitychange', onVisibility);
      globe.dispose();
      globeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    globeRef.current?.setLowPower(lowPower);
  }, [lowPower]);

  useEffect(() => {
    globeRef.current?.refreshColors();
  }, [settings.themeId, settings.customThemes]);

  useEffect(() => {
    globeRef.current?.setOpenHostIds(openHostIds);
  }, [openHostIds.join('|')]);

  const rows = useMemo(() => rankHudRows(geo.points).slice(0, 8), [geo.points]);
  const summary = useMemo(() => summarizeLive(geo.points), [geo.points]);
  const selectedKey = selected ? geoPointKey(selected) : null;
  const action = selected && !showcase ? resolveGlobeAction(selected, tabs) : null;

  const pick = (p: GeoPoint) => {
    setSelected(p);
    globeRef.current?.focusLatLng(p.lat, p.lng);
  };

  const onAction = () => {
    if (!selected?.hostId || !action) return;
    if (action === 'jump') {
      const tab = findTabForHost(tabs, selected.hostId);
      if (tab) setActiveTab(tab.id);
      return;
    }
    connectHost(selected.hostId, shortLabel(selected));
  };

  return (
    <div className="panel globe-panel">
      <div className="globe-holder" ref={holderRef} />
      <div className="globe-hud">
        <div className="globe-hud-sum">
          <em>LIVE</em>
          <span>{summary.conns} conn</span>
          <span>{summary.ssh} ssh</span>
          {summary.down > 0 && <span className="is-down">{summary.down} down</span>}
        </div>
        {rows.length === 0 ? (
          <div className="globe-hud-empty">no public peers yet</div>
        ) : (
          <ul className="globe-hud-list">
            {rows.map((p) => {
              const hud = formatGlobePin(p);
              const key = geoPointKey(p);
              return (
                <li key={key}>
                  <button
                    type="button"
                    className={`globe-hud-row kind-${p.kind}${p.up === false ? ' is-down' : ''}${selectedKey === key ? ' is-on' : ''}`}
                    onClick={() => pick(p)}
                  >
                    <i />
                    <b>{hud.name}</b>
                    <span>{hud.stat}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="globe-label">CILITERM</div>
      {selected && (
        <div className={`globe-detail kind-${selected.kind}${selected.up === false ? ' is-down' : ''}`}>
          <button className="globe-detail-close" onClick={() => setSelected(null)}>
            ✕
          </button>
          <div className="globe-detail-title">{selected.label}</div>
          <div className="globe-detail-row">
            <span>type</span>
            <b>{KIND_LABEL[selected.kind]}</b>
          </div>
          <div className="globe-detail-row">
            <span>ip</span>
            <b>{selected.ip}</b>
          </div>
          {action && (
            <button className="globe-detail-action" onClick={onAction}>
              {action === 'jump' ? 'jump to tab' : 'connect'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
