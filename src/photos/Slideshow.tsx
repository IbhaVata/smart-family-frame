import { memo, useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { PhotoMeta, Settings } from '@/types';
import { useStore } from '@/app/store';
import { acquirePhotoUrl, releasePhotoUrl, acquireThumbUrl, releaseThumbUrl, wasTransientFailure } from '@/services/photoService';
import { useSlideshow } from './useSlideshow';
import { slideshowPausedStore } from './slideshowBus';
import { Icon } from '@/components/Icon';

type Role = 'current' | 'leaving' | 'preload';

interface LayerProps {
  id: string;
  role: Role;
  transition: Settings['transition'];
  transitionMs: number;
  blur: boolean;
  onBroken: (id: string) => void;
}

/** One photo. Acquires its object URL on mount and releases it on unmount (no leaks). */
const PhotoLayer = memo(function PhotoLayer({ id, role, transition, transitionMs, blur, onBroken }: LayerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [bgLoaded, setBgLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    acquirePhotoUrl(id).then((u) => {
      if (!alive) return;
      if (!u) {
        // Only a genuinely missing blob permanently excludes a photo from rotation. A thrown/transient
        // storage error (a terminated IndexedDB connection, momentary quota pressure) just skips this
        // turn - the photo is not removed from `usable` and gets a fresh try the next time it comes
        // up, instead of vanishing from a 24/7 slideshow one glitch at a time.
        if (!wasTransientFailure(id)) onBroken(id);
      } else setUrl(u);
    });
    return () => {
      alive = false;
      releasePhotoUrl(id);
    };
  }, [id, onBroken]);

  useEffect(() => {
    if (!blur) return;
    let alive = true;
    setBgLoaded(false);
    acquireThumbUrl(id).then((u) => {
      if (alive && u) setBgUrl(u);
    });
    return () => {
      alive = false;
      releaseThumbUrl(id);
    };
  }, [id, blur]);

  const style = { '--t': `${transition === 'none' ? 0 : transitionMs}ms` } as CSSProperties;
  return (
    <div className={`photo-layer role-${role} t-${transition}`} style={style} data-photo-id={id}>
      {blur && bgUrl && <img className={`photo-bg ${bgLoaded ? 'loaded' : ''}`} src={bgUrl} alt="" draggable={false} onLoad={() => setBgLoaded(true)} />}
      {url && (
        <img
          className={`photo-main ${loaded ? 'loaded' : ''}`}
          src={url}
          alt=""
          draggable={false}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => onBroken(id)}
        />
      )}
    </div>
  );
});

export interface SlideshowProps {
  photos: PhotoMeta[];
  settings: Settings;
  /** Slower cadence multiplier (e.g. dashboard shows each photo longer). */
  intervalMultiplier?: number;
  showPausedBadge?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
}

export function Slideshow({ photos, settings, intervalMultiplier = 1, showPausedBadge = true, emptyTitle, emptyHint }: SlideshowProps) {
  const paused = useStore(slideshowPausedStore);
  const ids = useMemo(() => {
    const source = settings.slideshowSource === 'favorites' && photos.some((p) => p.favorite) ? photos.filter((p) => p.favorite) : photos;
    return source.map((p) => p.id);
  }, [photos, settings.slideshowSource]);

  const show = useSlideshow(ids, {
    intervalSec: settings.photoIntervalSec * intervalMultiplier,
    shuffle: settings.shuffle,
    loop: settings.loop,
    paused,
  });

  // Track the photo that is leaving so the crossfade can play, then drop it. The outgoing id is
  // captured HERE, synchronously during render ("adjust state while rendering", a pattern React
  // explicitly supports: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // rather than in a useEffect. An effect only runs after the commit that already dropped the
  // outgoing photo from `layers`, which unmounted its PhotoLayer, released its object URL and
  // removed its <img> - so by the time the effect fired there was nothing left to fade out, and a
  // brand-new PhotoLayer had to be mounted for it a moment later just to fade back in. Computing
  // `leaving` before that first commit keeps the outgoing layer mounted continuously, so the
  // crossfade actually crossfades and the photo is decoded once per slide, not twice.
  const [prevId, setPrevId] = useState<string | null>(show.currentId);
  const [leaving, setLeaving] = useState<string | null>(null);
  if (prevId !== show.currentId) {
    setPrevId(show.currentId);
    if (prevId) setLeaving(prevId);
  }
  useEffect(() => {
    if (!leaving) return undefined;
    const t = setTimeout(() => setLeaving(null), (settings.transition === 'none' ? 0 : settings.transitionMs) + 80);
    return () => clearTimeout(t);
  }, [leaving, settings.transition, settings.transitionMs]);

  const layers = useMemo(() => {
    const list: { id: string; role: Role }[] = [];
    const seen = new Set<string>();
    const push = (id: string | null, role: Role) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      list.push({ id, role });
    };
    push(show.currentId, 'current');
    push(leaving, 'leaving');
    push(show.nextId, 'preload');
    return list;
  }, [show.currentId, leaving, show.nextId]);

  if (ids.length === 0 || show.allBroken) {
    return (
      <div className="slideshow">
        <div className="slideshow-empty">
          <Icon name="photo" style={{ width: 'calc(var(--fu) * 5)', height: 'calc(var(--fu) * 5)', opacity: 0.5 }} />
          <div className="big">{show.allBroken ? 'Photos could not be displayed' : emptyTitle ?? 'No photos yet'}</div>
          <div className="small">{show.allBroken ? 'The stored images look damaged. Add new photos from Photos.' : emptyHint ?? 'Add photos from the Photos screen to start the slideshow.'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="slideshow" aria-label="Photo slideshow">
      {layers.map((l) => (
        <PhotoLayer key={l.id} id={l.id} role={l.role} transition={settings.transition} transitionMs={settings.transitionMs} blur={settings.blurBackground} onBroken={show.markBroken} />
      ))}
      {paused && showPausedBadge && (
        <div className="slideshow-paused">
          <Icon name="pause" /> Paused
        </div>
      )}
    </div>
  );
}
