import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Image as ImageIcon, Shield, X } from "lucide-react";
import heic2any from "heic2any";

export default function CreatePost() {
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [isProtected, setIsProtected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [converting, setConverting] = useState(false);

  const navigate = useNavigate();

  const isHeicFile = (file: File) => {
    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();
    return (
      name.endsWith(".heic") ||
      name.endsWith(".heif") ||
      type.includes("heic") ||
      type.includes("heif")
    );
  };

  const convertHeicToJpeg = async (file: File): Promise<File> => {
    const convertedBlob = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 0.9,
    });

    const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;

    return new File(
      [blob as BlobPart],
      file.name.replace(/\.(heic|heif)$/i, ".jpg"),
      {
        type: "image/jpeg",
      }
    );
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    try {
      let finalFile = selectedFile;

      if (isHeicFile(selectedFile)) {
        setConverting(true);
        finalFile = await convertHeicToJpeg(selectedFile);
      }

      if (preview) {
        URL.revokeObjectURL(preview);
      }

      setImage(finalFile);
      setPreview(URL.createObjectURL(finalFile));
    } catch (err) {
      console.error(err);
      alert("Failed to open image.");
    } finally {
      setConverting(false);
      e.target.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!image) return;

    setLoading(true);

    const formData = new FormData();
    formData.append("image", image);
    formData.append("caption", caption);
    formData.append("isProtected", String(isProtected));

    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
        body: formData,
      });

      if (!res.ok) {
        alert("Upload failed");
        return;
      }

      navigate("/");
    } catch (err) {
      console.error(err);
      alert("Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveImage = () => {
    if (preview) URL.revokeObjectURL(preview);
    setImage(null);
    setPreview(null);
  };

  return (
    <div className="page-enter max-w-4xl mx-auto py-10 px-4">
      <div className="soft-card overflow-hidden">

        {/* Header */}
        <div className="p-5 border-b flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-100"
          >
            <X size={22} />
          </button>

          <h2 className="font-bold text-lg">Create New Post</h2>

          <button
            onClick={handleSubmit}
            disabled={!image || loading || converting}
            className="primary-btn disabled:opacity-50"
          >
            {converting ? "Converting..." : loading ? "Sharing..." : "Share"}
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col md:flex-row">

          {/* Upload Area */}
          <div className="flex-1 aspect-square bg-gray-50 flex items-center justify-center border-r relative">

            {preview ? (
              <>
                <img
                  src={preview}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />

                <button
                  onClick={handleRemoveImage}
                  className="absolute top-4 right-4 bg-black/70 text-white p-2 rounded-full hover:bg-black"
                >
                  <X size={18} />
                </button>
              </>
            ) : (
              <div className="text-center space-y-4">

                <ImageIcon
                  size={70}
                  className="mx-auto text-gray-400"
                />

                <button
                  onClick={() =>
                    document.getElementById("file-input")?.click()
                  }
                  className="primary-btn"
                >
                  Select from computer
                </button>

                <p className="text-xs text-gray-500">
                  Supports JPG, PNG, WEBP, HEIC
                </p>

              </div>
            )}

            <input
              id="file-input"
              type="file"
              className="hidden"
              accept="image/*,.heic,.heif"
              onChange={handleImageChange}
            />

          </div>

          {/* Caption Section */}
          <div className="w-full md:w-96 p-6 space-y-6">

            <textarea
              placeholder="Write a caption..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="input-modern min-h-[120px] resize-none"
            />

            {/* Protection Toggle */}
            <div className="border-t pt-5 space-y-2">

              <div className="flex items-center justify-between">

                <div className="flex items-center gap-2 font-semibold text-sm">
                  <Shield size={18} className="text-indigo-500" />
                  No Screenshot Mode
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={isProtected}
                    onChange={(e) => setIsProtected(e.target.checked)}
                  />

                  <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-indigo-500
                  after:content-[''] after:absolute after:top-[2px] after:left-[2px]
                  after:bg-white after:border after:rounded-full after:h-5 after:w-5
                  after:transition-all peer-checked:after:translate-x-full" />

                </label>
              </div>

              <p className="text-xs text-gray-500 leading-relaxed">
                When enabled, viewers cannot share or easily screenshot this post.
              </p>

            </div>

          </div>
        </div>
      </div>
    </div>
  );
}