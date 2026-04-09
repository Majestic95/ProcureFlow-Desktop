import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Upload, X, File as FileIcon, Loader2 } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { storage } from '@/lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from '@/lib/file-storage';

interface FileUploadProps {
  value: { name: string; url: string }[] | null | undefined;
  onChange: (files: { name: string; url: string }[]) => void;
  folder: string;
}

export function FileUpload({ value, onChange, folder }: FileUploadProps) {
  const { toast } = useToast();
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const currentFiles = Array.isArray(value) ? value : [];

  const onDrop = (acceptedFiles: File[]) => {
    acceptedFiles.forEach(file => {
      const storageRef = ref(storage, `${folder}/${Date.now()}-${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        'state_changed',
        snapshot => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(prev => ({ ...prev, [file.name]: progress }));
        },
        error => {
          toast({
            variant: 'destructive',
            title: 'Upload Failed',
            description: error.message,
          });
          setUploadProgress(prev => {
            const newState = { ...prev };
            delete newState[file.name];
            return newState;
          });
        },
        () => {
          getDownloadURL(uploadTask.snapshot.ref).then(downloadURL => {
            onChange([...currentFiles, { name: file.name, url: downloadURL }]);
            setUploadProgress(prev => {
              const newState = { ...prev };
              delete newState[file.name];
              return newState;
            });
          }).catch(err => {
            console.error('Failed to get download URL:', err);
            toast({
              variant: 'destructive',
              title: 'Upload Error',
              description: 'Failed to retrieve file URL.',
            });
          });
        }
      );
    });
  };

  const onRemove = async (fileUrl: string, fileName: string) => {
    try {
      const fileRef = ref(storage, fileUrl);
      await deleteObject(fileRef);
      onChange(currentFiles.filter(file => file.url !== fileUrl));
      toast({
        title: 'File Removed',
        description: `${fileName} has been successfully removed.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Deletion Failed',
        description: `Could not remove ${fileName}. It might have already been deleted.`,
      });
       // Still remove from UI if deletion fails, as it might be an orphan reference
      onChange(currentFiles.filter(file => file.url !== fileUrl));
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  return (
    <div>
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-primary bg-primary/10' : 'border-input hover:border-primary'
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <Upload className="h-8 w-8" />
          {isDragActive ? (
            <p>Drop the files here ...</p>
          ) : (
            <p>Drag &apos;n&apos; drop some files here, or click to select files</p>
          )}
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {currentFiles.map(file => (
          <div key={file.url} className="flex items-center justify-between rounded-md border p-2">
            <div className="flex items-center gap-2">
              <FileIcon className="h-5 w-5 text-muted-foreground" />
              <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:underline">
                {file.name}
              </a>
            </div>
            <button
              type="button"
              onClick={() => onRemove(file.url, file.name)}
              className="p-1 rounded-full hover:bg-destructive/10 text-destructive"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
         {Object.entries(uploadProgress).map(([name, progress]) => (
           <div key={name} className="flex items-center justify-between rounded-md border p-2">
            <div className="flex items-center gap-2 w-full">
                <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                <div className="w-full">
                    <p className="text-sm font-medium">{name}</p>
                    <div className="w-full bg-muted rounded-full h-1.5">
                        <div className="bg-primary h-1.5 rounded-full" style={{ width: `${progress}%` }}></div>
                    </div>
                </div>
            </div>
           </div>
         ))}
      </div>
    </div>
  );
}
