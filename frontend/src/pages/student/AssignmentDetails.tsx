import { ArrowLeft, Calendar, CheckCircle2, ExternalLink, FileText, Paperclip, Send, Trash2, Upload, RefreshCw } from 'lucide-react';
import { ChangeEvent, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast, Toaster } from 'sonner';
import { api } from '../../lib/api';
import { submitAssignmentWork } from '../../api/submissions';

type Submission = { 
  id: string; 
  createdAt: string; 
  updatedAt: string; 
  content?: string | null; 
  fileName?: string | null; 
  fileType?: string | null; 
  fileSize?: number | null; 
  grades: { id: string }[];
};

type Assignment = {
  id: string; 
  title: string; 
  subject: string | null; 
  instructions: string | null; 
  description: string | null;
  dueDate: string; 
  createdAt: string; 
  attachmentUrl: string | null; 
  targetClass: string | null;
  Teacher: { firstName: string; lastName: string } | null; 
  ClassSection: { name: string } | null; 
  submissions: Submission[];
};

const fileSize = (bytes?: number | null) => !bytes ? '' : `${(bytes / 1024 / 1024).toFixed(bytes >= 1024 * 1024 ? 1 : 2)} MB`;

export default function AssignmentDetails() {
  const { assignmentId } = useParams();
  const [searchParams] = useSearchParams();
  const client = useQueryClient();
  const [showSubmitForm, setShowSubmitForm] = useState(searchParams.get('submit') === '1');
  const [selectedFile, setSelectedFile] = useState<File | undefined>();
  const [content, setContent] = useState('');
  const [downloadingResource, setDownloadingResource] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['student-assignment', assignmentId],
    queryFn: () => api.get<Assignment>(`/students/my-assignments/${assignmentId}`),
    enabled: Boolean(assignmentId),
  });

  const submitMutation = useMutation({
    mutationFn: () => submitAssignmentWork(assignmentId!, selectedFile, content),
    onSuccess: () => {
      setSelectedFile(undefined);
      setContent('');
      setShowSubmitForm(false);
      client.invalidateQueries({ queryKey: ['student-assignment', assignmentId] });
      toast.success('Work submitted successfully.');
    },
    onError: (error: Error) => toast.error(error.message || 'Your work could not be submitted.'),
  });

  useEffect(() => { 
    if (searchParams.get('submit') === '1') setShowSubmitForm(true); 
  }, [searchParams]);

  if (isLoading) return <div className="p-8 text-center text-gray-500">Loading assignment…</div>;
  if (isError || !data) return <div className="p-8 text-center text-red-600">Assignment could not be loaded or you do not have permission to access it.</div>;

  const submission = data.submissions && data.submissions[0];
  const status = submission ? (submission.grades && submission.grades.length ? 'Graded' : 'Submitted') : 'Pending';
  const deadlinePassed = new Date(data.dueDate) < new Date();
  const attachmentName = data.attachmentUrl?.split('/').pop() || data.attachmentUrl || 'Attached Resource';

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast.error('File must be 10MB or smaller.');
    setSelectedFile(file);
    event.target.value = '';
  };

  const handleOpenResource = async () => {
    if (!assignmentId) return;
    setDownloadingResource(true);
    try {
      const res = await api.get<{ url?: string; downloadUrl?: string; fileName?: string }>(
        `/students/my-assignments/${assignmentId}/resource`,
      );
      const downloadUrl = res?.downloadUrl || res?.url;
      if (downloadUrl && (downloadUrl.startsWith('http://') || downloadUrl.startsWith('https://'))) {
        window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      } else {
        toast.error('Could not generate download link for this resource.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Could not download assignment resource.');
    } finally {
      setDownloadingResource(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <Toaster position="top-right" richColors />
      <Link to="/assignments" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-800 hover:underline">
        <ArrowLeft className="h-4 w-4" />Back to assignments
      </Link>
      
      <article className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-start gap-4">
          <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
            <FileText />
          </div>
          <div>
            <p className="text-sm font-semibold text-blue-700">{data.subject || 'Assignment'}</p>
            <h1 className="text-2xl font-bold text-gray-900">{data.title}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {data.Teacher ? `${data.Teacher.firstName} ${data.Teacher.lastName}` : 'Teacher'}
            </p>
          </div>
        </div>

        <dl className="grid gap-4 border-y border-gray-100 py-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-400">Assigned</dt>
            <dd className="font-medium text-gray-800">{new Date(data.createdAt).toLocaleDateString()}</dd>
          </div>
          <div>
            <dt className="text-gray-400">Due date</dt>
            <dd className="flex items-center gap-1 font-medium text-gray-800">
              <Calendar className="h-4 w-4" />{new Date(data.dueDate).toLocaleDateString()}
            </dd>
          </div>
          <div>
            <dt className="text-gray-400">Class</dt>
            <dd className="font-medium text-gray-800">{data.ClassSection?.name || data.targetClass || 'All students'}</dd>
          </div>
          <div>
            <dt className="text-gray-400">Submission</dt>
            <dd className="font-medium text-gray-800">{status}</dd>
          </div>
        </dl>

        {(data.instructions || data.description) && (
          <section className="mt-6">
            <h2 className="font-semibold text-gray-900">Instructions</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600">{data.instructions || data.description}</p>
          </section>
        )}

        {data.attachmentUrl && (
          <section className="mt-6">
            <h2 className="font-semibold text-gray-900">Resources</h2>
            <button
              type="button"
              onClick={handleOpenResource}
              disabled={downloadingResource}
              className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-900 hover:underline cursor-pointer disabled:opacity-50"
            >
              <Paperclip className="h-4 w-4" />
              {downloadingResource ? 'Opening resource...' : attachmentName}
              <ExternalLink className="h-4 w-4" />
            </button>
          </section>
        )}

        {submission && (
          <section className="mt-6 rounded-xl border border-green-100 bg-green-50 p-4 text-sm text-green-900">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-5 w-5" />{status}
            </div>
            <p className="mt-1">Submitted {new Date(submission.createdAt).toLocaleString()}.</p>
            {submission.content && (
              <div className="mt-3 rounded-lg border border-green-200 bg-white/80 p-3.5 text-gray-800">
                <p className="text-xs font-bold uppercase tracking-wider text-green-800 mb-1">Your Written Answer:</p>
                <p className="whitespace-pre-wrap leading-relaxed">{submission.content}</p>
              </div>
            )}
            {submission.fileName && (
              <p className="mt-2 text-green-800">Submitted file: {submission.fileName}{submission.fileSize ? ` (${fileSize(submission.fileSize)})` : ''}</p>
            )}
          </section>
        )}

        {deadlinePassed ? (
          <p className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            The submission deadline has passed.
          </p>
        ) : (
          <div className="mt-8">
            {!showSubmitForm ? (
              <button 
                onClick={() => setShowSubmitForm(true)} 
                className="inline-flex items-center gap-2 rounded-lg bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 cursor-pointer"
              >
                {submission ? 'Replace Submission' : 'Submit Work'}
                <Send className="h-4 w-4" />
              </button>
            ) : (
              <form 
                onSubmit={event => { 
                  event.preventDefault(); 
                  if (!selectedFile && !content.trim()) return toast.error('Attach a file or enter a response before submitting.'); 
                  submitMutation.mutate(); 
                }} 
                className="rounded-xl border border-blue-100 bg-blue-50/40 p-5"
              >
                <h2 className="font-semibold text-gray-900">{submission ? 'Replace your submission' : 'Submit your work'}</h2>
                <p className="mt-1 text-sm text-gray-600">Attach a file, add a written response, or provide both.</p>
                <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-blue-300 bg-white px-4 py-4 text-sm font-semibold text-blue-800 hover:bg-blue-50">
                  <Upload className="h-4 w-4" />Choose file
                  <input type="file" className="hidden" onChange={selectFile} />
                </label>
                {selectedFile && (
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm text-gray-700">
                    <span className="truncate">{selectedFile.name} ({fileSize(selectedFile.size)})</span>
                    <button type="button" onClick={() => setSelectedFile(undefined)} className="ml-3 text-red-700" aria-label="Remove selected file">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <label className="mt-4 block text-sm font-medium text-gray-700">
                  Written response <span className="font-normal text-gray-400">(optional)</span>
                  <textarea 
                    value={content} 
                    onChange={event => setContent(event.target.value)} 
                    rows={4} 
                    className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white p-3 text-sm" 
                    placeholder="Add a note or written response…" 
                  />
                </label>
                <div className="mt-4 flex gap-3">
                  <button 
                    disabled={submitMutation.isPending} 
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 cursor-pointer"
                  >
                    {submitMutation.isPending ? 'Submitting…' : 'Submit Work'}
                    <Send className="h-4 w-4" />
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setShowSubmitForm(false)} 
                    disabled={submitMutation.isPending} 
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </article>
    </div>
  );
}
