export function UploadProgress({ progress }: { progress: number | null }) {
  const label = progress === 100 ? "Serverda saqlanmoqda…" : "Yuborilmoqda…";
  return (
    <div className="space-y-1.5 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2">
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-indigo-800">
        <span role="status">{label}</span>
        {progress !== null && <span>{progress}%</span>}
      </div>
      <progress aria-label="Yuklash jarayoni" max={100} value={progress ?? undefined} className="block h-2 w-full accent-indigo-600" />
    </div>
  );
}
