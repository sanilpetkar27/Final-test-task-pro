import { ProofPhoto, TaskProof } from '../../types';

export const MAX_TASK_PROOF_PHOTOS = 5;

const normalizeProofPhoto = (value: unknown): ProofPhoto | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const imageUrl = typeof candidate.imageUrl === 'string' ? candidate.imageUrl.trim() : '';
  const timestampValue =
    typeof candidate.timestamp === 'number'
      ? candidate.timestamp
      : typeof candidate.timestamp === 'string'
      ? Number(candidate.timestamp)
      : NaN;

  if (!imageUrl || !Number.isFinite(timestampValue)) {
    return null;
  }

  return {
    imageUrl,
    timestamp: timestampValue,
  };
};

export const getTaskProofPhotos = (proof: unknown): ProofPhoto[] => {
  if (Array.isArray(proof)) {
    return proof
      .map((entry) => normalizeProofPhoto(entry))
      .filter((entry): entry is ProofPhoto => Boolean(entry));
  }

  const singlePhoto = normalizeProofPhoto(proof);
  return singlePhoto ? [singlePhoto] : [];
};

export const toTaskProofValue = (proof: unknown): TaskProof | undefined => {
  const photos = getTaskProofPhotos(proof);
  if (photos.length === 0) {
    return undefined;
  }

  return Array.isArray(proof) ? photos : photos[0];
};

export const getLatestTaskProofTimestamp = (proof: unknown): number | null => {
  const photos = getTaskProofPhotos(proof);
  if (photos.length === 0) {
    return null;
  }

  return photos.reduce((latest, photo) => Math.max(latest, photo.timestamp), 0);
};
