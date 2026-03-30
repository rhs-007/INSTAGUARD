import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft } from "lucide-react";

export default function PostView() {
  const { postId } = useParams();
  const navigate = useNavigate();

  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPost();
  }, [postId]);

  const fetchPost = async () => {
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
      });

      const data = await res.json();
      setPost(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="animate-spin" size={28} />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="text-center p-10 text-gray-500">
        Post not found
      </div>
    );
  }

  return (
    <div className="page-enter md:ml-64 p-6 flex justify-center">
      <div className="soft-card max-w-3xl w-full overflow-hidden">

        <div className="p-4 border-b flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft size={20} />
          </button>

          <span className="font-semibold">{post.user.username}</span>
        </div>

        <img
          src={post.imageUrl}
          alt="Post"
          className="w-full object-cover"
        />

        <div className="p-4 space-y-2">

          {post.caption && (
            <p className="text-sm">
              <span className="font-semibold mr-2">
                {post.user.username}
              </span>
              {post.caption}
            </p>
          )}

        </div>
      </div>
    </div>
  );
}