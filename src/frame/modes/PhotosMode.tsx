import type { PhotoMeta, Settings } from '@/types';
import { Slideshow } from '@/photos/Slideshow';
import { CornerClock } from '@/clock/ClockDisplay';

export function PhotosMode({ photos, settings }: { photos: PhotoMeta[]; settings: Settings }) {
  return (
    <div className="mode photos-mode">
      <Slideshow photos={photos} settings={settings} />
      {settings.showClockOnPhotos && <CornerClock settings={settings} />}
    </div>
  );
}
