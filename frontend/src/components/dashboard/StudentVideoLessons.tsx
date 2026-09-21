import React, { useState, useEffect, useCallback } from 'react';
import {
  Video,
  Play,
  BookOpen,
  User,
  Calendar,
  X,
  Search,
  RefreshCw,
  ExternalLink,
  Sparkles,
  Film,
} from 'lucide-react';
import { toast } from 'sonner';
import { EducationalVideo, getStudentVideos } from '../../api/videos';

interface Props {
  limit?: number;
  showHeader?: boolean;
  searchQuery?: string;
}

export default function StudentVideoLessons({ limit, showHeader = true, searchQuery: propSearchQuery = '' }: Props) {
  const [videos, setVideos] = useState<EducationalVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('ALL');
  const [localSearch, setLocalSearch] = useState('');
  const [playingVideo, setPlayingVideo] = useState<EducationalVideo | null>(null);

  const effectiveSearch = (localSearch || propSearchQuery).trim().toLowerCase();

  const loadVideos = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getStudentVideos(
        selectedSubjectId === 'ALL' ? undefined : selectedSubjectId,
      );
      setVideos(data);
    } catch (err: any) {
      toast.error('Failed to load video lessons: ' + (err?.message || 'Error'));
    } finally {
      setIsLoading(false);
    }
  }, [selectedSubjectId]);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  // Extract unique subjects for filter pills
  const subjectsMap = new Map<string, string>();
  for (const v of videos) {
    if (v.Subject) {
      subjectsMap.set(v.Subject.id, v.Subject.name);
    }
  }
  const availableSubjects = Array.from(subjectsMap.entries()).map(([id, name]) => ({
    id,
    name,
  }));

  const filteredVideos = videos.filter((v) => {
    if (effectiveSearch) {
      const q = effectiveSearch;
      const titleMatch = v.title.toLowerCase().includes(q);
      const descMatch = (v.description || '').toLowerCase().includes(q);
      const teacherMatch = `${v.Teacher?.firstName || ''} ${v.Teacher?.lastName || ''}`.toLowerCase().includes(q);
      const subjectMatch = (v.Subject?.name || '').toLowerCase().includes(q);
      return titleMatch || descMatch || teacherMatch || subjectMatch;
    }
    return true;
  });

  const displayedVideos = limit ? filteredVideos.slice(0, limit) : filteredVideos;

  return (
    <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100 space-y-6">
      {/* Header */}
      {showHeader ? (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shadow-sm shrink-0">
              <Video className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-gray-900 text-xl">Educational Video Lessons</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-100 text-red-700">
                  Targeted for You
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Teacher-curated video lectures vetted for your enrolled class section.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-56">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search topics..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-gray-800 placeholder-gray-400"
              />
              {localSearch && (
                <button
                  onClick={() => setLocalSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              onClick={loadVideos}
              disabled={isLoading}
              className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors shrink-0"
              title="Refresh videos"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search video lessons by title, topic, or teacher..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-gray-800 placeholder-gray-400"
            />
            {localSearch && (
              <button
                onClick={() => setLocalSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={loadVideos}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors shrink-0 self-start sm:self-auto"
            title="Refresh videos"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      )}

      {/* Subject Filter Pills */}
      {availableSubjects.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-100">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Subject:</span>
          <button
            onClick={() => setSelectedSubjectId('ALL')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
              selectedSubjectId === 'ALL'
                ? 'bg-blue-900 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:text-gray-900'
            }`}
          >
            All Subjects ({videos.length})
          </button>
          {availableSubjects.map((sub) => {
            const count = videos.filter((v) => v.Subject?.id === sub.id).length;
            return (
              <button
                key={sub.id}
                onClick={() => setSelectedSubjectId(sub.id)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                  selectedSubjectId === sub.id
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:text-gray-900'
                }`}
              >
                {sub.name} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Videos Grid */}
      {isLoading ? (
        <div className="py-16 text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-red-600 animate-spin mx-auto" />
          <p className="text-xs font-semibold text-gray-400">Loading your video lessons...</p>
        </div>
      ) : videos.length === 0 ? (
        <div className="py-12 text-center bg-gray-50/60 rounded-2xl border border-dashed border-gray-200 p-6 space-y-2">
          <Sparkles className="w-8 h-8 text-gray-300 mx-auto" />
          <p className="text-sm font-bold text-gray-700">No video lessons available</p>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            {selectedSubjectId !== 'ALL'
              ? 'No videos found for this subject. Try switching back to "All Subjects".'
              : 'Your teachers have not published any approved video lessons for your section yet. Check back soon!'}
          </p>
        </div>
      ) : displayedVideos.length === 0 ? (
        <div className="py-12 text-center bg-gray-50/60 rounded-2xl border border-dashed border-gray-200 p-6 space-y-2">
          <Search className="w-8 h-8 text-gray-300 mx-auto" />
          <p className="text-sm font-bold text-gray-700">No matching video lessons</p>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            No video lessons found matching "{localSearch || propSearchQuery}".
          </p>
          <button
            onClick={() => setLocalSearch('')}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Clear search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {displayedVideos.map((video) => {
            const isUpload = video.sourceType === 'UPLOAD' || Boolean(video.videoUrl && !video.youtubeUrl);

            return (
              <div
                key={video.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col group"
              >
                {/* Thumbnail Container */}
                <div
                  className="relative aspect-video bg-gray-950 cursor-pointer overflow-hidden"
                  onClick={() => setPlayingVideo(video)}
                >
                  {isUpload ? (
                    <div className="w-full h-full bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col items-center justify-center p-4 text-center">
                      <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 mb-1.5 group-hover:scale-110 transition-transform">
                        <Film className="w-6 h-6" />
                      </div>
                      <span className="text-[11px] font-bold text-gray-300 line-clamp-1">
                        {video.title}
                      </span>
                      {video.fileSize && (
                        <span className="text-[10px] text-gray-400 mt-0.5">
                          {(video.fileSize / (1024 * 1024)).toFixed(1)} MB
                        </span>
                      )}
                    </div>
                  ) : (
                    <img
                      src={
                        video.thumbnailUrl ||
                        `https://img.youtube.com/vi/${video.youtubeVideoId}/hqdefault.jpg`
                      }
                      alt={video.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-95 group-hover:opacity-100"
                    />
                  )}

                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                      <Play className="w-5 h-5 fill-white ml-0.5" />
                    </div>
                  </div>

                  {/* Source type badge on thumbnail */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                    <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-black/70 text-white backdrop-blur-sm shadow">
                      {video.Subject?.name || 'Lesson'}
                    </span>
                    {isUpload ? (
                      <span className="px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-indigo-600/90 text-white backdrop-blur-sm shadow flex items-center gap-1">
                        <Film className="w-2.5 h-2.5" /> Upload
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-red-600/90 text-white backdrop-blur-sm shadow flex items-center gap-1">
                        <Video className="w-2.5 h-2.5" /> YouTube
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <h4 className="font-bold text-gray-900 text-sm leading-snug line-clamp-2 group-hover:text-red-700 transition-colors">
                      {video.title}
                    </h4>
                    {video.description && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {video.description}
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="truncate max-w-[120px]">
                        {video.Teacher?.firstName} {video.Teacher?.lastName}
                      </span>
                    </div>

                    <button
                      onClick={() => setPlayingVideo(video)}
                      className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1 shrink-0"
                    >
                      <Play className="w-3 h-3 fill-red-700" /> Watch
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal: Video Player (YouTube & HTML5 Video) ────────────────────────── */}
      {playingVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-gray-950 rounded-3xl border border-gray-800 w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4 bg-gray-900/90 border-b border-gray-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {playingVideo.sourceType === 'UPLOAD' || (playingVideo.videoUrl && !playingVideo.youtubeUrl) ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-600 text-white flex items-center gap-1 shrink-0">
                    <Film className="w-3 h-3" /> Uploaded Video
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-600 text-white flex items-center gap-1 shrink-0">
                    <Video className="w-3 h-3" /> YouTube
                  </span>
                )}
                <div>
                  <h4 className="font-bold text-sm text-gray-100 truncate max-w-lg">
                    {playingVideo.title}
                  </h4>
                  <p className="text-[11px] text-gray-400">
                    {playingVideo.Subject?.name} &bull; Teacher {playingVideo.Teacher?.firstName} {playingVideo.Teacher?.lastName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPlayingVideo(null)}
                className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative aspect-video w-full bg-black flex items-center justify-center">
              {playingVideo.sourceType === 'UPLOAD' || (playingVideo.videoUrl && !playingVideo.youtubeUrl) ? (
                <video
                  src={playingVideo.videoUrl || undefined}
                  controls
                  autoPlay
                  className="w-full h-full max-h-[70vh] object-contain"
                />
              ) : (
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${playingVideo.youtubeVideoId}?autoplay=1&rel=0`}
                  title={playingVideo.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full border-0"
                />
              )}
            </div>

            {playingVideo.description && (
              <div className="p-4 bg-gray-900 text-xs text-gray-300 border-t border-gray-800">
                <p className="font-bold text-gray-400 uppercase tracking-wider text-[10px] mb-1">
                  Teacher Study Notes &amp; Instructions
                </p>
                <p>{playingVideo.description}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

