import { useState, useRef } from 'react';
import './video-lesson.css';

/* ─── Main Video Player ─── */
export function VideoPlayer({ videoUrl, title, thumbnailUrl }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  return (
    <div className="vl-player">
      <div className="vl-player-header">
        <span className="vl-player-icon">🎬</span>
        <span className="vl-player-title">{title || 'Training Video'}</span>
      </div>
      <div className="vl-video-wrap">
        <video
          ref={videoRef}
          src={videoUrl}
          poster={thumbnailUrl}
          controls
          playsInline
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
      </div>
    </div>
  );
}

/* ─── Video Section: shows player if directVideoUrl exists, HeyGen embed if videoId exists, or coming-soon placeholder ─── */
export function VideoSection({ sectionKey, sectionTitle, sectionContent, isAdmin, presetVideoId, directVideoUrl }) {

  // Resolve the video URL — directVideoUrl takes priority, then construct from HeyGen videoId
  const resolvedUrl = directVideoUrl || (presetVideoId ? `https://app.heygen.com/embeds/${presetVideoId}` : null);

  if (resolvedUrl) {
    // Check if it's a YouTube or Vimeo embed
    const youtubeId = extractYouTubeId(resolvedUrl);
    const vimeoId = extractVimeoId(resolvedUrl);
    const heygenEmbed = extractHeyGenEmbedId(resolvedUrl);

    if (youtubeId) {
      return (
        <div className="vl-player">
          <div className="vl-player-header">
            <span className="vl-player-icon">🎬</span>
            <span className="vl-player-title">{sectionTitle || 'Training Video'}</span>
          </div>
          <div className="vl-video-wrap vl-embed-wrap">
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}`}
              title={sectionTitle}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              frameBorder="0"
            />
          </div>
        </div>
      );
    }

    if (vimeoId) {
      return (
        <div className="vl-player">
          <div className="vl-player-header">
            <span className="vl-player-icon">🎬</span>
            <span className="vl-player-title">{sectionTitle || 'Training Video'}</span>
          </div>
          <div className="vl-video-wrap vl-embed-wrap">
            <iframe
              src={`https://player.vimeo.com/video/${vimeoId}`}
              title={sectionTitle}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              frameBorder="0"
            />
          </div>
        </div>
      );
    }

    if (heygenEmbed) {
      return (
        <div className="vl-player">
          <div className="vl-player-header">
            <span className="vl-player-icon">🎬</span>
            <span className="vl-player-title">{sectionTitle || 'Training Video'}</span>
          </div>
          <div className="vl-video-wrap vl-embed-wrap">
            <iframe
              src={`https://app.heygen.com/embeds/${heygenEmbed}`}
              title={sectionTitle}
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              frameBorder="0"
            />
          </div>
        </div>
      );
    }

    // Direct MP4 / video file URL
    return <VideoPlayer videoUrl={resolvedUrl} title={sectionTitle} />;
  }

  // No video available — show "coming soon" placeholder
  return (
    <div className="vl-coming-soon">
      <div className="vl-coming-soon-icon">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect x="4" y="8" width="40" height="32" rx="4" stroke="currentColor" strokeWidth="2" fill="none"/>
          <polygon points="20,16 34,24 20,32" fill="currentColor" opacity="0.4"/>
        </svg>
      </div>
      <div className="vl-coming-soon-text">
        <strong>Instructor Video Coming Soon</strong>
        <span>A comprehensive training video for this section is being recorded by our lead instructor and will be available shortly.</span>
      </div>
    </div>
  );
}

/* ─── Helpers to extract YouTube / Vimeo IDs ─── */
function extractYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function extractVimeoId(url) {
  if (!url) return null;
  const m = url.match(/(?:vimeo\.com\/)(\d+)/);
  return m ? m[1] : null;
}

function extractHeyGenEmbedId(url) {
  if (!url) return null;
  const m = url.match(/app\.heygen\.com\/embeds\/([a-f0-9]+)/);
  return m ? m[1] : null;
}
