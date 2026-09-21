import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Video,
  Plus,
  Play,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileEdit,
  Trash2,
  Send,
  X,
  ExternalLink,
  BookOpen,
  Users,
  RefreshCw,
  Upload,
  Film,
  FileVideo,
  Check,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  EducationalVideo,
  VideoStatus,
  VideoSourceType,
  getTeacherVideos,
  createVideo,
  updateVideo,
  submitVideoForReview,
  deleteVideo,
  getVideoFilterOptions,
  extractYouTubeVideoId,
} from '../../api/videos';

export default function TeacherVideoManagement() {
  const [videos, setVideos] = useState<EducationalVideo[]>([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string; code?: string }>>([]);
  const [classSections, setClassSections] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'ALL' | VideoStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState<EducationalVideo | null>(null);
  const [playingVideo, setPlayingVideo] = useState<EducationalVideo | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [sourceType, setSourceType] = useState<VideoSourceType>('YOUTUBE');
  const [formUrl, setFormUrl] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSubjectId, setFormSubjectId] = useState('');
  const [formSectionId, setFormSectionId] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const previewVideoId = extractYouTubeVideoId(formUrl);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [videosData, filterData] = await Promise.all([
        getTeacherVideos(),
        getVideoFilterOptions().catch(() => ({ subjects: [], classSections: [] })),
      ]);
      setVideos(videosData);
      setSubjects(filterData.subjects || []);
      setClassSections(filterData.classSections || []);
      if (filterData.subjects?.length && !formSubjectId) {
        setFormSubjectId(filterData.subjects[0].id);
      }
    } catch (err: any) {
      toast.error('Failed to load videos: ' + (err?.message || 'Error'));
    } finally {
      setIsLoading(false);
    }
  }, [formSubjectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Clean up object URL on unmount or reset
  useEffect(() => {
    return () => {
      if (filePreviewUrl) {
        URL.revokeObjectURL(filePreviewUrl);
      }
    };
  }, [filePreviewUrl]);

  const resetForm = () => {
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
    }
    setEditingVideo(null);
    setSourceType('YOUTUBE');
    setFormUrl('');
    setVideoFile(null);
    setFilePreviewUrl(null);
    setFormTitle('');
    setFormDescription('');
    setFormSubjectId(subjects[0]?.id || '');
    setFormSectionId('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleOpenCreateModal = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const handleOpenEditModal = (video: EducationalVideo) => {
    resetForm();
    setEditingVideo(video);
    setSourceType(video.sourceType || (video.videoUrl ? 'UPLOAD' : 'YOUTUBE'));
    setFormUrl(video.youtubeUrl || '');
    setFormTitle(video.title);
    setFormDescription(video.description || '');
    setFormSubjectId(video.subjectId);
    setFormSectionId(video.classSectionId || '');
    setIsFormOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate MIME
    const allowedMimes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg', 'video/x-matroska', 'video/mpeg'];
    if (!allowedMimes.includes(file.type.toLowerCase()) && !file.name.match(/\.(mp4|webm|mov|mkv|ogg)$/i)) {
      toast.error('Unsupported video format. Please select an MP4, WebM, or MOV video.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Validate size (50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('File exceeds the 50MB maximum size limit.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
    }

    setVideoFile(file);
    const objUrl = URL.createObjectURL(file);
    setFilePreviewUrl(objUrl);
  };

  const handleRemoveFile = () => {
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
    }
    setVideoFile(null);
    setFilePreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (isDraft: boolean) => {
    // Validation
    if (sourceType === 'YOUTUBE') {
      if (!formUrl.trim()) {
        return toast.error('Please enter a YouTube video URL');
      }
      if (!previewVideoId) {
        return toast.error('Please enter a valid YouTube video link (e.g., https://www.youtube.com/watch?v=... or https://youtu.be/...)');
      }
    } else if (sourceType === 'UPLOAD') {
      if (!videoFile && (!editingVideo || !editingVideo.videoUrl)) {
        return toast.error('Please select a video file to upload');
      }
    }

    if (!formTitle.trim()) {
      return toast.error('Please provide a video title');
    }
    if (!formSubjectId) {
      return toast.error('Please select a subject');
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('title', formTitle.trim());
      if (formDescription.trim()) {
        formData.append('description', formDescription.trim());
      }
      formData.append('sourceType', sourceType);
      formData.append('subjectId', formSubjectId);
      if (formSectionId) {
        formData.append('classSectionId', formSectionId);
      }
      formData.append('isDraft', isDraft ? 'true' : 'false');

      if (sourceType === 'YOUTUBE') {
        formData.append('youtubeUrl', formUrl.trim());
      } else if (sourceType === 'UPLOAD') {
        if (videoFile) {
          formData.append('videoFile', videoFile);
        }
      }

      if (editingVideo) {
        formData.append('status', isDraft ? 'DRAFT' : 'PENDING_APPROVAL');
        await updateVideo(editingVideo.id, formData);
        toast.success(
          isDraft
            ? 'Video draft updated successfully.'
            : 'Video updated and submitted to admin for review!',
        );
      } else {
        await createVideo(formData);
        toast.success(
          isDraft
            ? 'Video saved as draft.'
            : 'Video submitted to admin for review!',
        );
      }

      setIsFormOpen(false);
      resetForm();
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save video');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitForReview = async (video: EducationalVideo) => {
    try {
      await submitVideoForReview(video.id);
      toast.success(`"${video.title}" submitted to admin for review.`);
      await loadData();
    } catch (err: any) {
      toast.error('Failed to submit video: ' + (err?.message || 'Error'));
    }
  };

  const handleDelete = async (video: EducationalVideo) => {
    if (!window.confirm(`Are you sure you want to delete "${video.title}"?`)) {
      return;
    }
    try {
      await deleteVideo(video.id);
      toast.success('Video deleted successfully.');
      await loadData();
    } catch (err: any) {
      toast.error('Failed to delete video: ' + (err?.message || 'Error'));
    }
  };

  const filteredVideos = videos.filter((v) => {
    if (activeFilter !== 'ALL' && v.status !== activeFilter) return false;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      return (
        (v.title || '').toLowerCase().includes(q) ||
        (v.description || '').toLowerCase().includes(q) ||
        (v.Subject?.name || (v as any).subject?.name || '').toLowerCase().includes(q) ||
        (v.ClassSection?.name || (v as any).classSection?.name || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts = {
    all: videos.length,
    pending: videos.filter((v) => v.status === 'PENDING_APPROVAL').length,
    approved: videos.filter((v) => v.status === 'APPROVED').length,
    draft: videos.filter((v) => v.status === 'DRAFT').length,
    rejected: videos.filter((v) => v.status === 'REJECTED').length,
  };

  return (
    <div className="space-y-6">
      {/* Top action banner */}
      <div className="bg-gradient-to-r from-red-900 via-rose-900 to-indigo-950 rounded-3xl p-6 md:p-8 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-red-200 text-xs font-bold mb-2">
            <Video className="w-4 h-4 text-red-400" />
            Educational Video Hub
          </div>
          <h2 className="text-2xl md:text-3xl font-black">Educational Video Lessons</h2>
          <p className="text-xs md:text-sm text-red-100/80 mt-1 max-w-xl">
            Curate engaging video materials for your students using YouTube links or direct video file uploads. All video submissions are vetted by admin before being released to your enrolled class sections.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="px-6 py-3 bg-white hover:bg-gray-100 text-red-900 rounded-2xl font-black text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shrink-0"
        >
          <Plus className="w-4 h-4" /> Submit New Video
        </button>
      </div>

      {/* Filter Tabs, Search & Refresh */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 bg-white p-1.5 rounded-2xl border border-gray-200 shadow-sm text-xs font-bold">
          <button
            onClick={() => setActiveFilter('ALL')}
            className={`px-3.5 py-1.5 rounded-xl transition-all ${
              activeFilter === 'ALL'
                ? 'bg-blue-900 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            All ({counts.all})
          </button>
          <button
            onClick={() => setActiveFilter('APPROVED')}
            className={`px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
              activeFilter === 'APPROVED'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-gray-600 hover:text-emerald-700'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Live for Students ({counts.approved})
          </button>
          <button
            onClick={() => setActiveFilter('PENDING_APPROVAL')}
            className={`px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
              activeFilter === 'PENDING_APPROVAL'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-gray-600 hover:text-amber-700'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Pending Review ({counts.pending})
          </button>
          <button
            onClick={() => setActiveFilter('DRAFT')}
            className={`px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
              activeFilter === 'DRAFT'
                ? 'bg-gray-700 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <FileEdit className="w-3.5 h-3.5" />
            Drafts ({counts.draft})
          </button>
          {counts.rejected > 0 && (
            <button
              onClick={() => setActiveFilter('REJECTED')}
              className={`px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                activeFilter === 'REJECTED'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-rose-700'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              Needs Revision ({counts.rejected})
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 w-full lg:w-auto">
          <div className="relative flex-1 lg:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search title, subject, section..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-9 py-2 bg-white border border-gray-200 rounded-2xl text-xs font-medium outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 shadow-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={loadData}
            disabled={isLoading}
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 bg-white border border-gray-200 rounded-xl transition-colors shadow-sm shrink-0"
            title="Refresh videos"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Video Cards Grid */}
      {isLoading ? (
        <div className="py-20 text-center space-y-3 bg-white rounded-3xl border border-gray-100">
          <RefreshCw className="w-8 h-8 text-red-600 animate-spin mx-auto" />
          <p className="text-sm font-semibold text-gray-500">Loading educational videos...</p>
        </div>
      ) : filteredVideos.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-3xl border border-dashed border-gray-200 p-8 space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
            {searchQuery ? <Search className="w-7 h-7" /> : <Video className="w-7 h-7" />}
          </div>
          <h3 className="font-bold text-gray-900 text-base">
            {searchQuery ? 'No matching video lessons found' : 'No video resources found'}
          </h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            {searchQuery
              ? `No videos match "${searchQuery}". Check the spelling or reset your search.`
              : activeFilter === 'ALL'
              ? 'You have not submitted any video lessons yet. Click the button above to add educational video content for your class.'
              : `No videos found matching status "${activeFilter}".`}
          </p>
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              className="mt-2 px-4 py-2 bg-red-50 text-red-700 hover:bg-red-100 rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" /> Clear Search
            </button>
          ) : activeFilter === 'ALL' ? (
            <button
              onClick={handleOpenCreateModal}
              className="mt-2 px-5 py-2.5 bg-red-900 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-red-800 transition-colors inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Submit First Video
            </button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredVideos.map((video) => {
            const isLive = video.status === 'APPROVED';
            const isPending = video.status === 'PENDING_APPROVAL';
            const isDraft = video.status === 'DRAFT';
            const isRejected = video.status === 'REJECTED';
            const isUpload = video.sourceType === 'UPLOAD' || Boolean(video.videoUrl && !video.youtubeUrl);

            return (
              <div
                key={video.id}
                className="bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col"
              >
                {/* Thumbnail / Video banner */}
                <div
                  className="relative aspect-video bg-gray-900 cursor-pointer group overflow-hidden"
                  onClick={() => setPlayingVideo(video)}
                >
                  {isUpload ? (
                    <div className="w-full h-full bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col items-center justify-center p-4 text-center">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 mb-2 group-hover:scale-110 transition-transform">
                        <Film className="w-6 h-6" />
                      </div>
                      <span className="text-[11px] font-bold text-gray-300 line-clamp-1">
                        {video.title}
                      </span>
                      {video.fileSize && (
                        <span className="text-[10px] text-gray-400 mt-0.5">
                          {(video.fileSize / (1024 * 1024)).toFixed(1)} MB &bull; {video.mimeType?.replace('video/', '').toUpperCase() || 'VIDEO'}
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
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-90 group-hover:opacity-100"
                    />
                  )}

                  <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                      <Play className="w-5 h-5 fill-white ml-0.5" />
                    </div>
                  </div>

                  {/* Source Type Badge (Top-Left) */}
                  <div className="absolute top-3 left-3">
                    {isUpload ? (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-600 text-white shadow-md flex items-center gap-1">
                        <Film className="w-3 h-3" /> Uploaded Video
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-600 text-white shadow-md flex items-center gap-1">
                        <Video className="w-3 h-3" /> YouTube
                      </span>
                    )}
                  </div>

                  {/* Status Pill Badge (Top-Right) */}
                  <div className="absolute top-3 right-3">
                    {isLive && (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-600 text-white shadow-md flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Live
                      </span>
                    )}
                    {isPending && (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white shadow-md flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Pending Review
                      </span>
                    )}
                    {isDraft && (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-gray-800/80 text-white backdrop-blur-sm shadow-md">
                        Draft
                      </span>
                    )}
                    {isRejected && (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-600 text-white shadow-md flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Needs Revision
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    {/* Tags */}
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-800 border border-blue-100 flex items-center gap-1">
                        <BookOpen className="w-3 h-3" />
                        {video.Subject?.name || 'General'}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-800 border border-purple-100 flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {video.ClassSection?.name ? `${video.ClassSection.name}` : 'All Sections'}
                      </span>
                    </div>

                    <h3 className="font-bold text-gray-900 text-base leading-snug line-clamp-2">
                      {video.title}
                    </h3>
                    {video.description && (
                      <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">
                        {video.description}
                      </p>
                    )}

                    {/* Rejection Alert Box */}
                    {isRejected && video.rejectionReason && (
                      <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1">
                        <p className="font-bold flex items-center gap-1 text-rose-700">
                          <AlertCircle className="w-3.5 h-3.5" /> Admin Feedback:
                        </p>
                        <p>{video.rejectionReason}</p>
                      </div>
                    )}
                  </div>

                  {/* Card Actions Footer */}
                  <div className="pt-4 mt-4 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-[10px] text-gray-400 font-semibold">
                      {new Date(video.createdAt).toLocaleDateString()}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {/* Send to admin button for drafts and rejected videos */}
                      {(isDraft || isRejected) && (
                        <button
                          onClick={() => handleSubmitForReview(video)}
                          className="px-3 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1"
                          title="Submit to Admin for Review"
                        >
                          <Send className="w-3 h-3" /> Submit
                        </button>
                      )}

                      {/* Edit Button */}
                      {(isDraft || isRejected) && (
                        <button
                          onClick={() => handleOpenEditModal(video)}
                          className="p-1.5 text-gray-500 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit Details"
                        >
                          <FileEdit className="w-4 h-4" />
                        </button>
                      )}

                      {/* Delete Button */}
                      <button
                        onClick={() => handleDelete(video)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Video"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal: Submit / Edit Video ────────────────────────────────────────── */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-xl my-8 overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 bg-gradient-to-r from-red-900 to-rose-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Video className="w-6 h-6 text-red-400" />
                <h3 className="font-black text-lg">
                  {editingVideo ? 'Edit Video Submission' : 'Submit Educational Video'}
                </h3>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                disabled={isSubmitting}
                className="p-1.5 text-red-200 hover:text-white rounded-xl hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <div className="p-6 space-y-5">
              {/* Video Source Selection */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-600 mb-2">
                  VIDEO SOURCE <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSourceType('YOUTUBE');
                      handleRemoveFile();
                    }}
                    className={`p-3.5 rounded-2xl border text-left flex items-center gap-3 transition-all ${
                      sourceType === 'YOUTUBE'
                        ? 'border-red-600 bg-red-50/70 text-red-950 shadow-sm ring-1 ring-red-600'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700 bg-gray-50/50'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        sourceType === 'YOUTUBE'
                          ? 'bg-red-600 text-white shadow'
                          : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      <Video className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-black">YouTube Video</div>
                      <div className="text-[10px] text-gray-500">Paste URL link</div>
                    </div>
                    {sourceType === 'YOUTUBE' && (
                      <Check className="w-4 h-4 text-red-600 ml-auto shrink-0" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSourceType('UPLOAD');
                      setFormUrl('');
                    }}
                    className={`p-3.5 rounded-2xl border text-left flex items-center gap-3 transition-all ${
                      sourceType === 'UPLOAD'
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-950 shadow-sm ring-1 ring-indigo-600'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700 bg-gray-50/50'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        sourceType === 'UPLOAD'
                          ? 'bg-indigo-600 text-white shadow'
                          : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      <Upload className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-black">Upload Video File</div>
                      <div className="text-[10px] text-gray-500">MP4, WebM, MOV</div>
                    </div>
                    {sourceType === 'UPLOAD' && (
                      <Check className="w-4 h-4 text-indigo-600 ml-auto shrink-0" />
                    )}
                  </button>
                </div>
              </div>

              {/* YouTube Link Input (Option 1) */}
              {sourceType === 'YOUTUBE' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-gray-600 mb-1.5">
                      YOUTUBE VIDEO LINK <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="url"
                      placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                      value={formUrl}
                      onChange={(e) => setFormUrl(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">
                      Accepts standard YouTube links, short URLs (youtu.be), or YouTube Shorts.
                    </p>
                  </div>

                  {/* Real-time YouTube Preview Card */}
                  {previewVideoId && (
                    <div className="p-3 bg-red-50/60 border border-red-200 rounded-2xl flex items-center gap-3">
                      <img
                        src={`https://img.youtube.com/vi/${previewVideoId}/mqdefault.jpg`}
                        alt="Preview"
                        className="w-24 h-16 object-cover rounded-xl shadow-sm shrink-0"
                      />
                      <div className="min-w-0">
                        <span className="text-[10px] font-black uppercase text-red-700 bg-red-100 px-2 py-0.5 rounded-full inline-block mb-1">
                          YouTube Video Detected
                        </span>
                        <p className="text-xs font-bold text-gray-800 truncate">ID: {previewVideoId}</p>
                        <a
                          href={`https://www.youtube.com/watch?v=${previewVideoId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-red-700 font-semibold flex items-center gap-1 hover:underline mt-0.5"
                        >
                          Verify on YouTube <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Upload Video File (Option 2) */}
              {sourceType === 'UPLOAD' && (
                <div className="space-y-3">
                  <label className="block text-xs font-black uppercase tracking-wider text-gray-600 mb-1.5">
                    VIDEO FILE <span className="text-red-500">*</span>
                  </label>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,video/ogg,video/x-matroska,.mp4,.webm,.mov"
                    onChange={handleFileChange}
                    className="hidden"
                    id="video-upload-input"
                  />

                  {!videoFile && (!editingVideo || !editingVideo.videoUrl) ? (
                    <label
                      htmlFor="video-upload-input"
                      className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 hover:border-indigo-500 hover:bg-indigo-50/30 rounded-2xl cursor-pointer transition-all text-center group"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                        <Upload className="w-6 h-6" />
                      </div>
                      <span className="text-xs font-black text-gray-800 uppercase tracking-wider">
                        Choose Video File
                      </span>
                      <span className="text-[11px] text-gray-500 mt-1">
                        Supported formats: MP4, WebM, MOV &bull; Maximum size: 50MB
                      </span>
                    </label>
                  ) : (
                    <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileVideo className="w-5 h-5 text-indigo-600 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-900 truncate">
                              {videoFile ? videoFile.name : editingVideo?.title || 'Current Uploaded Video'}
                            </p>
                            <p className="text-[10px] text-indigo-700 font-semibold">
                              {videoFile
                                ? `${(videoFile.size / (1024 * 1024)).toFixed(2)} MB &bull; Ready to upload`
                                : 'Uploaded video on file'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <label
                            htmlFor="video-upload-input"
                            className="px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 rounded-lg cursor-pointer transition-colors"
                          >
                            Change
                          </label>
                          {videoFile && (
                            <button
                              type="button"
                              onClick={handleRemoveFile}
                              className="p-1 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                              title="Remove file"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Video Preview Player */}
                      {(filePreviewUrl || (editingVideo && editingVideo.videoUrl)) && (
                        <div className="rounded-xl overflow-hidden bg-black aspect-video max-h-48 flex items-center justify-center shadow-inner">
                          <video
                            src={filePreviewUrl || editingVideo?.videoUrl || undefined}
                            controls
                            className="w-full h-full max-h-48 object-contain"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Title Input */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-600 mb-1.5">
                  VIDEO TITLE <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g., Intro to Quadratic Equations, Photosynthesis Lecture"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                />
              </div>

              {/* Description Input */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-gray-600 mb-1.5">
                  DESCRIPTION / STUDY INSTRUCTIONS (OPTIONAL)
                </label>
                <textarea
                  rows={3}
                  placeholder="Provide context or guidance for students watching this video..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 resize-none"
                />
              </div>

              {/* Targeting Grid: Subject & Class Section */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Subject Selector */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-gray-600 mb-1.5">
                    SUBJECT <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formSubjectId}
                    onChange={(e) => setFormSubjectId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                  >
                    {subjects.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name} {sub.code ? `(${sub.code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Class Section Selector */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-gray-600 mb-1.5">
                    TARGET CLASS SECTION
                  </label>
                  <select
                    value={formSectionId}
                    onChange={(e) => setFormSectionId(e.target.value)}
                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                  >
                    <option value="">All Assigned Sections</option>
                    {classSections.map((sec) => (
                      <option key={sec.id} value={sec.id}>
                        {sec.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Progress indication banner */}
              {isSubmitting && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-900">
                  <RefreshCw className="w-5 h-5 text-red-600 animate-spin shrink-0" />
                  <div className="text-xs">
                    <p className="font-bold">
                      {sourceType === 'UPLOAD' && videoFile
                        ? 'Uploading video file & processing submission...'
                        : 'Submitting video lesson...'}
                    </p>
                    <p className="text-red-700/80 text-[11px]">
                      Please wait while your content is securely uploaded.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="p-6 bg-gray-50 border-t border-gray-100 flex flex-col-reverse sm:flex-row items-center justify-end gap-3">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setIsFormOpen(false)}
                className="w-full sm:w-auto px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleSubmit(true)}
                className="w-full sm:w-auto px-5 py-2.5 bg-white border border-gray-300 hover:bg-gray-100 text-gray-800 rounded-xl text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-50"
              >
                Save as Draft
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleSubmit(false)}
                className="w-full sm:w-auto px-6 py-2.5 bg-red-900 hover:bg-red-800 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-md shadow-red-900/20 flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                {isSubmitting ? 'Uploading…' : 'Send to Admin for Review'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Video Player (YouTube & HTML5 Video) ────────────────────────── */}
      {playingVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-gray-950 rounded-3xl border border-gray-800 w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4 bg-gray-900/80 border-b border-gray-800 text-white flex items-center justify-between">
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
                    {playingVideo.Subject?.name} &bull; {playingVideo.ClassSection?.name || 'All Sections'}
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
                  Lesson Notes &amp; Instructions
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

