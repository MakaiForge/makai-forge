import { useEffect, useRef } from 'react';
import type { ThemeBackground as BackgroundConfig } from '@types';

interface ThemeBackgroundProps {
  config: BackgroundConfig | null;
  assetPath?: string | null;
}

export function ThemeBackground({ config, assetPath }: ThemeBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && config?.type === 'video') {
      videoRef.current.play().catch(() => {});
    }
  }, [config?.type, assetPath]);

  const hasOverlay =
    config?.overlayColor ||
    (config?.overlayBlur && config.overlayBlur !== '0' && config.overlayBlur !== '0px');

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: -1,
      overflow: 'hidden',
      backgroundColor: 'var(--app-bg, #0c0c12)',
    }}>
      {config && config.type !== 'none' && (() => {
        const position = config.position || 'center';
        const size = config.size || 'cover';

        return (
          <>
            {(config.type === 'image' || config.type === 'gif') && assetPath && (
              <img
                src={`local:${assetPath}`}
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: size as any,
                  objectPosition: position,
                }}
              />
            )}

            {config.type === 'video' && assetPath && (
              <video
                ref={videoRef}
                src={`local:${assetPath}`}
                muted
                loop
                playsInline
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: size as any,
                  objectPosition: position,
                }}
              />
            )}

            {config.type === 'video-url' && config.url && (
              <video
                ref={videoRef}
                src={config.url}
                muted
                loop
                playsInline
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: size as any,
                  objectPosition: position,
                }}
              />
            )}

            {config.type === 'image-url' && config.url && (
              <img
                src={config.url}
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: size as any,
                  objectPosition: position,
                }}
              />
            )}

            {hasOverlay && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: config.overlayColor || undefined,
                backdropFilter: config.overlayBlur && config.overlayBlur !== '0px'
                  ? `blur(${config.overlayBlur})`
                  : undefined,
              }} />
            )}
          </>
        );
      })()}
    </div>
  );
}
