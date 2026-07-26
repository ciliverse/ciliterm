import { useEffect, useRef, useState } from 'react';
import type { GeoPoint } from '@ciliterm/shared';
import { EncomGlobe } from './encomGlobe';
import { getSys } from '../../transport/clients';
import { useSettings } from '../../settings/settings';

const KIND_LABEL: Record<GeoPoint['kind'], string> = {
  self: 'this machine',
  ssh: 'ssh host',
  conn: 'live connection',
};

export function Globe({ lowPower }: { lowPower: boolean }) {
  const { settings } = useSettings();
  const holderRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<EncomGlobe | null>(null);
  const [selected, setSelected] = useState<GeoPoint | null>(null);

  useEffect(() => {
    if (!holderRef.current) return;
    const globe = new EncomGlobe(holderRef.current, lowPower);
    globeRef.current = globe;
    globe.setSelectHandler(setSelected);
    globe.start();

    // Feed real geolocation data pushed over /sys.
    const sys = getSys();
    const offMsg = sys.onMessage((msg) => {
      if (msg.t === 'geo') globe.setData(msg.data);
    });
    sys.send({ t: 'geo.request' });

    // Pause rendering when tab/window is hidden to save power.
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

  return (
    <div className="panel globe-panel">
      <div className="globe-holder" ref={holderRef} />
      <div className="globe-label">CILITERM</div>
      {selected && (
        <div className={`globe-detail kind-${selected.kind}`}>
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
          <div className="globe-detail-row">
            <span>coords</span>
            <b>
              {selected.lat.toFixed(2)}, {selected.lng.toFixed(2)}
            </b>
          </div>
        </div>
      )}
    </div>
  );
}
