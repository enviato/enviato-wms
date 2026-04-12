"use client";

import React from "react";
import { Plus, Loader2, Trash2, Upload } from "lucide-react";
import { PhotoRecord } from "../types";

interface PhotoGalleryProps {
  photos: PhotoRecord[];
  uploadingPhoto: boolean;
  deletingPhotoId: string | null;
  onUpload: () => void;
  onDelete: (photoId: string) => void;
  onLightbox: (url: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function PhotoGallery({
  photos,
  uploadingPhoto,
  deletingPhotoId,
  onUpload,
  onDelete,
  onLightbox,
  fileInputRef,
  onFileChange,
}: PhotoGalleryProps) {
  return (
    <div className="bg-white border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-ui font-semibold text-txt-primary tracking-tight flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-txt-tertiary">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          Images
          {photos.length > 0 && (
            <span className="text-txt-tertiary font-normal ml-1">({photos.length})</span>
          )}
        </p>
        <div className="flex items-center gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            // Explicit list excludes HEIC/HEIF — browsers can't render them
            // and our pipeline doesn't currently convert them.
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={onFileChange}
          />
          <button
            onClick={onUpload}
            disabled={uploadingPhoto}
            className="inline-flex items-center gap-1 px-2 py-1 text-meta text-txt-secondary hover:text-txt-primary bg-surface-secondary hover:bg-surface-hover rounded transition-colors cursor-pointer disabled:opacity-50"
          >
            {uploadingPhoto ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Plus size={12} />
            )}
            Add Photo
          </button>
        </div>
      </div>

      {photos.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="group/photo relative aspect-square rounded-lg overflow-hidden bg-surface-secondary cursor-pointer"
              onClick={() => onLightbox(photo.storage_url)}
            >
              <img
                src={photo.storage_url}
                alt={photo.photo_type || "Package photo"}
                className="w-full h-full object-cover transition-transform duration-200 group-hover/photo:scale-105"
              />
              {/* Hover overlay with delete */}
              <div className="absolute inset-0 bg-black/0 group-hover/photo:bg-black/30 transition-colors duration-200 flex items-start justify-end p-1.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(photo.id);
                  }}
                  disabled={deletingPhotoId === photo.id}
                  className="opacity-0 group-hover/photo:opacity-100 p-1 bg-white/90 rounded text-red-500 hover:bg-white transition-all duration-150 cursor-pointer"
                  title="Remove photo"
                >
                  {deletingPhotoId === photo.id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Trash2 size={12} />
                  )}
                </button>
              </div>
              {/* Photo type badge */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent px-2 py-1.5">
                <p className="text-white text-[10px] font-medium truncate">{photo.photo_type || "Photo"}</p>
              </div>
            </div>
          ))}

          {/* Add more button */}
          <button
            onClick={onUpload}
            disabled={uploadingPhoto}
            className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-1 text-txt-tertiary hover:text-primary transition-colors cursor-pointer"
          >
            {uploadingPhoto ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                <Plus size={16} />
                <span className="text-[10px] font-medium">Add</span>
              </>
            )}
          </button>
        </div>
      ) : (
        <button
          onClick={onUpload}
          disabled={uploadingPhoto}
          className="w-full py-8 border-2 border-dashed border-border hover:border-primary/50 rounded-lg flex flex-col items-center gap-2 text-txt-tertiary hover:text-primary transition-colors cursor-pointer"
        >
          {uploadingPhoto ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <>
              <Upload size={20} />
              <span className="text-meta">Click to upload photos</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
