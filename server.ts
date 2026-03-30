import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import prisma from "./src/lib/prisma.ts";

import { moderateTextLocal } from "./src/lib/textModeration.ts";
import { moderateImageLocal } from "./src/lib/imageModeration.ts";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";
const REFRESH_SECRET = process.env.REFRESH_SECRET || "refresh-secret-key";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

const upload = multer({ storage: multer.memoryStorage() });

type AuthedRequest = Request & {
  user?: { id: string; username: string; role: string };
};

type ModerationFlagClass = {
  className: string;
  score: number;
};

type ImageModerationResult = {
  isExplicit: boolean;
  needsReview?: boolean;
  reason?: string | null;
  flaggedClasses?: ModerationFlagClass[];
};

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function fileExtFromMime(mimetype: string) {
  const part = mimetype.split("/")[1];
  if (!part) return "jpg";
  return part.replace(/[^a-zA-Z0-9]/g, "") || "jpg";
}

function saveLocalDMImage(
  buffer: Buffer,
  mimetype: string,
  folder: "dm_public" | "dm_restricted"
) {
  const ext = fileExtFromMime(mimetype);
  const name = `${Date.now()}_${crypto.randomBytes(10).toString("hex")}.${ext}`;
  const dir = path.join(process.cwd(), "uploads", folder);
  ensureDir(dir);

  const full = path.join(dir, name);
  fs.writeFileSync(full, buffer);

  return `/uploads/${folder}/${name}`;
}

function accountStatusPayload(user: any) {
  return {
    id: user.id,
    username: user.username,
    avatarUrl: user.avatarUrl,
    role: user.role,
    isBanned: !!user.isBanned,
    bannedAt: user.bannedAt || null,
    banReason: user.banReason || null,
    suspendedUntil: user.suspendedUntil || null,
    suspendReason: user.suspendReason || null,
  };
}

function isActiveSuspension(date: Date | string | null | undefined) {
  if (!date) return false;
  const t = new Date(date).getTime();
  return Number.isFinite(t) && t > Date.now();
}

function getImageModerationMatched(mod: ImageModerationResult) {
  return mod.flaggedClasses?.map((x) => `${x.className}:${x.score}`).join(", ") || null;
}

function getImageModerationReason(mod: ImageModerationResult) {
  return mod.reason || "nudenet_flagged";
}

function safeJsonStringify(value: any) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, { cors: { origin: "*" } });

  app.use(express.json({ limit: "50mb" }));

  ensureDir(path.join(process.cwd(), "uploads", "dm_public"));
  ensureDir(path.join(process.cwd(), "uploads", "dm_restricted"));
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  const authenticate = async (
    req: AuthedRequest,
    res: Response,
    next: NextFunction
  ) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;

      const dbUser = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          username: true,
          role: true,
          isBanned: true,
          bannedAt: true,
          banReason: true,
          suspendedUntil: true,
          suspendReason: true,
        },
      });

      if (!dbUser) {
        return res.status(401).json({ error: "User not found" });
      }

      if (dbUser.isBanned) {
        return res.status(403).json({
          error: "Your account has been banned.",
          accountStatus: {
            isBanned: true,
            bannedAt: dbUser.bannedAt,
            banReason: dbUser.banReason,
          },
        });
      }

      if (isActiveSuspension(dbUser.suspendedUntil)) {
        return res.status(403).json({
          error: "Your account is suspended.",
          accountStatus: {
            suspendedUntil: dbUser.suspendedUntil,
            suspendReason: dbUser.suspendReason,
          },
        });
      }

      req.user = {
        id: dbUser.id,
        username: dbUser.username,
        role: dbUser.role,
      };

      next();
    } catch (e) {
      console.log("JWT VERIFY FAILED:", e);
      return res.status(401).json({ error: "Invalid token" });
    }
  };

  const isAdmin = (
    req: AuthedRequest,
    res: Response,
    next: NextFunction
  ) => {
    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };

  const userSockets = new Map<string, string>();

  io.on("connection", (socket) => {
    socket.on("register", (userId: string) => {
      userSockets.set(userId, socket.id);
      console.log(`User ${userId} registered with socket ${socket.id}`);
    });

    socket.on(
      "typing",
      (payload: {
        chatId: string;
        recipientId: string;
        isTyping: boolean;
        senderId: string;
      }) => {
        const recipientSocket = userSockets.get(payload.recipientId);
        if (recipientSocket) io.to(recipientSocket).emit("typing", payload);
      }
    );

    socket.on("disconnect", () => {
      for (const [userId, socketId] of userSockets.entries()) {
        if (socketId === socket.id) {
          userSockets.delete(userId);
          break;
        }
      }
    });
  });

  const assertChatAccess = async (chatId: string, userId: string) => {
    return prisma.chat.findFirst({
      where: { id: chatId, chatparticipant: { some: { userId } } },
      include: { chatparticipant: true },
    });
  };

  const getOtherParticipantId = (chat: any, meId: string) => {
    return (
      chat?.chatparticipant?.find((p: any) => p.userId !== meId)?.userId || null
    );
  };

  const formatPost = (post: any) => {
    if (!post) return null;
    const { like, comment, ...rest } = post;
    return {
      ...rest,
      likes: Array.isArray(like) ? like : [],
      comments: Array.isArray(comment) ? comment : [],
    };
  };

  const getPostWithRelations = async (postId: string) => {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        user: true,
        like: true,
        comment: {
          include: { user: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return formatPost(post);
  };

  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res
        .status(400)
        .json({ error: "username, email, password required" });
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          username,
          email,
          password: hashedPassword,
          isBanned: false,
          bannedAt: null,
          banReason: null,
          suspendedUntil: null,
          suspendReason: null,
        },
      });

      return res.json({
        message: "User created",
        user: { id: user.id, username: user.username, email: user.email },
      });
    } catch {
      return res
        .status(400)
        .json({ error: "User already exists or invalid data" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    if (user.isBanned) {
      return res.status(403).json({
        error: "Your account has been banned.",
        accountStatus: {
          isBanned: true,
          bannedAt: user.bannedAt || null,
          banReason: user.banReason || null,
        },
      });
    }

    if (isActiveSuspension(user.suspendedUntil)) {
      return res.status(403).json({
        error: "Your account is suspended.",
        accountStatus: {
          suspendedUntil: user.suspendedUntil,
          suspendReason: user.suspendReason || null,
        },
      });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const accessToken = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    const refreshToken = jwt.sign({ id: user.id }, REFRESH_SECRET, {
      expiresIn: "7d",
    });

    return res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
        role: user.role,
      },
    });
  });

  app.get("/api/posts", authenticate, async (_req: AuthedRequest, res: Response) => {
    try {
      const posts = await prisma.post.findMany({
        include: {
          user: true,
          like: true,
          comment: {
            include: { user: true },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return res.json(posts.map(formatPost));
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Failed to fetch posts" });
    }
  });

  app.get(
    "/api/posts/:id",
    authenticate,
    async (req: AuthedRequest, res: Response) => {
      try {
        const postId = String(req.params.id);

        const post = await prisma.post.findUnique({
          where: { id: postId },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
              },
            },
            like: true,
            comment: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    avatarUrl: true,
                  },
                },
              },
              orderBy: { createdAt: "asc" },
            },
          },
        });

        if (!post) {
          return res.status(404).json({ error: "Post not found" });
        }

        return res.json(formatPost(post));
      } catch (e) {
        console.error("Fetch single post error:", e);
        return res.status(500).json({ error: "Failed to fetch post" });
      }
    }
  );

  app.post(
    "/api/posts",
    authenticate,
    upload.single("image"),
    async (req: AuthedRequest, res: Response) => {
      const { caption, isProtected } = req.body as {
        caption?: string;
        isProtected?: string;
      };
      const file = (req as any).file as Express.Multer.File | undefined;

      if (!file) return res.status(400).json({ error: "Image required" });

      try {
        const b64 = Buffer.from(file.buffer).toString("base64");
        const dataURI = "data:" + file.mimetype + ";base64," + b64;

        const result = await cloudinary.uploader.upload(dataURI, {
          folder: "instaguard",
        });

        const protectedOn = String(isProtected) === "true";

        const post = await prisma.post.create({
          data: {
            userId: req.user!.id,
            imageUrl: result.secure_url,
            caption: caption || null,
            isProtected: protectedOn,
            protectedEnabledAt: protectedOn ? new Date() : null,
          },
        });

        const fullPost = await getPostWithRelations(post.id);
        return res.json(fullPost);
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Upload failed" });
      }
    }
  );

  app.post(
    "/api/posts/:id/like",
    authenticate,
    async (req: AuthedRequest, res: Response) => {
      try {
        const postId = String(req.params.id);
        const userId = req.user!.id;

        const post = await prisma.post.findUnique({
          where: { id: postId },
          select: { id: true },
        });

        if (!post) return res.status(404).json({ error: "Post not found" });

        const existingLike = await prisma.like.findFirst({
          where: { postId, userId },
        });

        if (existingLike) {
          await prisma.like.delete({
            where: { id: existingLike.id },
          });

          const updatedPost = await getPostWithRelations(postId);

          return res.json({
            liked: false,
            post: updatedPost,
          });
        }

        await prisma.like.create({
          data: {
            id: crypto.randomUUID(),
            postId,
            userId,
          },
        });

        const updatedPost = await getPostWithRelations(postId);

        return res.json({
          liked: true,
          post: updatedPost,
        });
      } catch (e) {
        console.error("Like toggle error:", e);
        return res.status(500).json({ error: "Failed to toggle like" });
      }
    }
  );

  app.post(
    "/api/posts/:id/comments",
    authenticate,
    async (req: AuthedRequest, res: Response) => {
      try {
        const postId = String(req.params.id);
        const userId = req.user!.id;
        const { text } = req.body as { text?: string };

        const cleanText = (text || "").trim();
        if (!cleanText) {
          return res.status(400).json({ error: "Comment text required" });
        }

        const post = await prisma.post.findUnique({
          where: { id: postId },
          select: { id: true },
        });

        if (!post) return res.status(404).json({ error: "Post not found" });

        const comment = await prisma.comment.create({
          data: {
            id: crypto.randomUUID(),
            postId,
            userId,
            text: cleanText,
          },
          include: {
            user: true,
          },
        });

        return res.json(comment);
      } catch (e) {
        console.error("Add comment error:", e);
        return res.status(500).json({ error: "Failed to add comment" });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // PROTECTED POST: suspicious activity logging
  // ---------------------------------------------------------------------------
  app.post(
    "/api/posts/:id/suspicious",
    authenticate,
    async (req: AuthedRequest, res: Response) => {
      try {
        const postId = String(req.params.id);
        const viewerId = req.user!.id;
        const { type, meta } = req.body as {
          type?: string;
          meta?: any;
        };

        const allowedTypes = new Set([
          "TAB_SWITCH",
          "WINDOW_BLUR",
          "SCREENSHOT_ATTEMPT",
          "DEVTOOLS_SHORTCUT",
          "RIGHT_CLICK",
          "COPY",
        ]);

        if (!type || !allowedTypes.has(type)) {
          return res.status(400).json({ error: "Invalid suspicious event type" });
        }

        const post = await prisma.post.findUnique({
          where: { id: postId },
          select: {
            id: true,
            userId: true,
            isProtected: true,
          },
        });

        if (!post) return res.status(404).json({ error: "Post not found" });
        if (!post.isProtected) {
          return res.status(400).json({ error: "Only protected posts can log suspicious events" });
        }

        const created = await prisma.suspiciousevent.create({
          data: {
            postId,
            viewerId,
            type,
            meta: safeJsonStringify(meta),
          },
        });

        return res.json({
          success: true,
          event: created,
        });
      } catch (e) {
        console.error("Suspicious event log error:", e);
        return res.status(500).json({ error: "Failed to log suspicious event" });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // PROTECTED POST: adaptive hold time
  // ---------------------------------------------------------------------------
  app.get(
    "/api/posts/:id/hold-time",
    authenticate,
    async (req: AuthedRequest, res: Response) => {
      try {
        const postId = String(req.params.id);
        const viewerId = req.user!.id;

        const post = await prisma.post.findUnique({
          where: { id: postId },
          select: {
            id: true,
            userId: true,
            isProtected: true,
          },
        });

        if (!post) return res.status(404).json({ error: "Post not found" });

        // Non-protected posts do not need adaptive hold
        if (!post.isProtected) {
          return res.json({
            holdTime: 0,
            riskLevel: "PUBLIC",
          });
        }

        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const [
          postSpecificSuspiciousCount,
          screenshotCount,
          highRiskActionCount,
          priorIncompleteViews,
        ] = await Promise.all([
          prisma.suspiciousevent.count({
            where: {
              postId,
              viewerId,
              createdAt: { gte: since },
            },
          }),
          prisma.suspiciousevent.count({
            where: {
              viewerId,
              type: "SCREENSHOT_ATTEMPT",
              createdAt: { gte: since },
            },
          }),
          prisma.suspiciousevent.count({
            where: {
              viewerId,
              type: {
                in: [
                  "SCREENSHOT_ATTEMPT",
                  "DEVTOOLS_SHORTCUT",
                  "RIGHT_CLICK",
                  "COPY",
                ],
              },
              createdAt: { gte: since },
            },
          }),
          prisma.postViewTrace.count({
            where: {
              postId,
              viewerId,
              completed: false,
              createdAt: { gte: since },
            },
          }),
        ]);

        let holdTime = 3;
        let riskLevel = "NORMAL";

        const riskScore =
          postSpecificSuspiciousCount +
          screenshotCount * 2 +
          highRiskActionCount +
          Math.min(priorIncompleteViews, 3);

        if (riskScore >= 8) {
          holdTime = 8;
          riskLevel = "HIGH";
        } else if (riskScore >= 4) {
          holdTime = 5;
          riskLevel = "ELEVATED";
        } else {
          holdTime = 3;
          riskLevel = "NORMAL";
        }

        return res.json({
          holdTime,
          riskLevel,
          metrics: {
            postSpecificSuspiciousCount,
            screenshotCount,
            highRiskActionCount,
            priorIncompleteViews,
          },
        });
      } catch (e) {
        console.error("Adaptive hold-time error:", e);
        return res.status(500).json({ error: "Failed to fetch hold time" });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // PROTECTED POST: view trace logging
  // ---------------------------------------------------------------------------
  app.post(
    "/api/posts/:id/view-trace",
    authenticate,
    async (req: AuthedRequest, res: Response) => {
      try {
        const postId = String(req.params.id);
        const viewerId = req.user!.id;
        const { viewMs, completed } = req.body as {
          viewMs?: number;
          completed?: boolean;
        };

        const safeViewMs = Number(viewMs);

        if (!Number.isFinite(safeViewMs) || safeViewMs < 0) {
          return res.status(400).json({ error: "Valid viewMs is required" });
        }

        const post = await prisma.post.findUnique({
          where: { id: postId },
          select: {
            id: true,
            userId: true,
            isProtected: true,
          },
        });

        if (!post) return res.status(404).json({ error: "Post not found" });
        if (!post.isProtected) {
          return res.status(400).json({ error: "Only protected posts can store view traces" });
        }

        const trace = await prisma.postViewTrace.create({
          data: {
            postId,
            viewerId,
            viewMs: Math.max(0, Math.floor(safeViewMs)),
            completed: !!completed,
          },
        });

        return res.json({
          success: true,
          trace,
        });
      } catch (e) {
        console.error("View trace log error:", e);
        return res.status(500).json({ error: "Failed to save view trace" });
      }
    }
  );

  app.get(
    "/api/users/search",
    authenticate,
    async (req: AuthedRequest, res: Response) => {
      const q = String(req.query.q || "").trim();

      try {
        const users = await prisma.user.findMany({
          where: {
            id: { not: req.user!.id },
            role: { not: "ADMIN" },
            isBanned: false,
            OR: [
              { suspendedUntil: null },
              { suspendedUntil: { lte: new Date() } },
            ],
            ...(q
              ? {
                  AND: [
                    {
                      OR: [
                        { username: { contains: q } },
                        { email: { contains: q } },
                        { bio: { contains: q } },
                      ],
                    },
                  ],
                }
              : {}),
          },
          select: {
            id: true,
            username: true,
            email: true,
            bio: true,
            avatarUrl: true,
            role: true,
          },
          take: 20,
        });

        const myFollowing = await prisma.follow.findMany({
          where: { followerId: req.user!.id },
          select: { followingId: true },
        });

        const followingSet = new Set(myFollowing.map((f: any) => f.followingId));

        const results = users.map((u: any) => ({
          id: u.id,
          username: u.username,
          email: u.email,
          bio: u.bio,
          avatarUrl: u.avatarUrl,
          role: u.role,
          isFollowing: followingSet.has(u.id),
        }));

        return res.json(results);
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Search failed" });
      }
    }
  );

  app.post(
    "/api/users/:id/follow",
    authenticate,
    async (req: AuthedRequest, res: Response) => {
      try {
        const followerId = req.user!.id;
        const followingId = String(req.params.id);

        if (followerId === followingId) {
          return res.status(400).json({ error: "You cannot follow yourself" });
        }

        const targetUser = await prisma.user.findUnique({
          where: { id: followingId },
          select: {
            id: true,
            role: true,
            isBanned: true,
            suspendedUntil: true,
          },
        });

        if (!targetUser) {
          return res.status(404).json({ error: "User not found" });
        }

        if (targetUser.role === "ADMIN") {
          return res.status(403).json({ error: "Cannot follow admin" });
        }

        if (targetUser.isBanned || isActiveSuspension(targetUser.suspendedUntil)) {
          return res.status(403).json({ error: "Cannot follow this user right now" });
        }

        const existing = await prisma.follow.findFirst({
          where: { followerId, followingId },
        });

        if (existing) {
          return res.json({ success: true, message: "Already following" });
        }

        const follow = await prisma.follow.create({
          data: {
            id: crypto.randomUUID(),
            followerId,
            followingId,
          },
        });

        return res.json({
          success: true,
          message: "Followed successfully",
          follow,
        });
      } catch (e) {
        console.error("Follow error:", e);
        return res.status(500).json({ error: "Failed to follow user" });
      }
    }
  );

  app.post(
    "/api/users/:id/unfollow",
    authenticate,
    async (req: AuthedRequest, res: Response) => {
      try {
        const followerId = req.user!.id;
        const followingId = String(req.params.id);

        const existing = await prisma.follow.findFirst({
          where: { followerId, followingId },
        });

        if (!existing) {
          return res.json({ success: true, message: "Already unfollowed" });
        }

        await prisma.follow.delete({
          where: { id: existing.id },
        });

        return res.json({
          success: true,
          message: "Unfollowed successfully",
        });
      } catch (e) {
        console.error("Unfollow error:", e);
        return res.status(500).json({ error: "Failed to unfollow user" });
      }
    }
  );

  app.get(
    "/api/explore/posts",
    authenticate,
    async (_req: AuthedRequest, res: Response) => {
      try {
        const posts = await prisma.post.findMany({
          where: {
            isProtected: false,
          },
          select: {
            id: true,
            caption: true,
            imageUrl: true,
            isProtected: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 30,
        });

        return res.json(posts);
      } catch (e) {
        console.error("Explore posts fetch failed:", e);
        return res.status(500).json({ error: "Failed to fetch explore posts" });
      }
    }
  );

  app.get(
    "/api/admin/moderation/queue",
    authenticate,
    isAdmin,
    async (req: AuthedRequest, res: Response) => {
      try {
        const status = String(req.query.status || "PENDING").toUpperCase();
        const safeStatus = status === "RESOLVED" ? "RESOLVED" : "PENDING";

        const items = await prisma.moderationqueue.findMany({
          where: { status: safeStatus as any },
          orderBy: { createdAt: "desc" },
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
                isBanned: true,
                bannedAt: true,
                banReason: true,
                suspendedUntil: true,
                suspendReason: true,
              },
            },
            recipient: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
              },
            },
          },
          take: 200,
        });

        return res.json(items);
      } catch (e) {
        console.error(e);
        return res
          .status(500)
          .json({ error: "Failed to fetch moderation queue" });
      }
    }
  );

  app.patch(
    "/api/admin/moderation/queue/:id/approve",
    authenticate,
    isAdmin,
    async (req: AuthedRequest, res: Response) => {
      try {
        const id = String(req.params.id);
        const { resolutionNote } = req.body as { resolutionNote?: string };

        const item = await prisma.moderationqueue.findUnique({
          where: { id },
        });

        if (!item) {
          return res.status(404).json({ error: "Queue item not found" });
        }

        const updatedQueue = await prisma.moderationqueue.update({
          where: { id },
          data: {
            status: "RESOLVED",
            resolvedAt: new Date(),
            resolvedById: req.user!.id,
            resolutionNote: resolutionNote?.trim() || "Approved by admin",
          },
        });

        let updatedMessage: any = null;

        if (item.messageId) {
          updatedMessage = await prisma.message.update({
            where: { id: item.messageId },
            data: {
              status: "visible",
              restrictedReason: null,
            },
          });

          const rSock = userSockets.get(updatedMessage.recipientId);
          const sSock = userSockets.get(updatedMessage.senderId);
          if (rSock) io.to(rSock).emit("message_updated", updatedMessage);
          if (sSock) io.to(sSock).emit("message_updated", updatedMessage);
        }

        return res.json({
          success: true,
          queue: updatedQueue,
          message: updatedMessage,
        });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to approve queue item" });
      }
    }
  );

  app.patch(
    "/api/admin/moderation/queue/:id/reject",
    authenticate,
    isAdmin,
    async (req: AuthedRequest, res: Response) => {
      try {
        const id = String(req.params.id);
        const { resolutionNote } = req.body as { resolutionNote?: string };

        const item = await prisma.moderationqueue.findUnique({
          where: { id },
        });

        if (!item) {
          return res.status(404).json({ error: "Queue item not found" });
        }

        const updatedQueue = await prisma.moderationqueue.update({
          where: { id },
          data: {
            status: "RESOLVED",
            resolvedAt: new Date(),
            resolvedById: req.user!.id,
            resolutionNote: resolutionNote?.trim() || "Rejected by admin",
          },
        });

        let updatedMessage: any = null;

        if (item.messageId) {
          updatedMessage = await prisma.message.update({
            where: { id: item.messageId },
            data: {
              status: "restricted",
              restrictedReason: item.reason || "Rejected by admin moderation",
              imageUrl: null,
              text: item.kind === "TEXT" ? null : undefined,
            } as any,
          });

          const rSock = userSockets.get(updatedMessage.recipientId);
          const sSock = userSockets.get(updatedMessage.senderId);
          if (rSock) io.to(rSock).emit("message_updated", updatedMessage);
          if (sSock) io.to(sSock).emit("message_updated", updatedMessage);
        }

        return res.json({
          success: true,
          queue: updatedQueue,
          message: updatedMessage,
        });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to reject queue item" });
      }
    }
  );

  app.patch(
    "/api/admin/moderation/queue/:id/resolve",
    authenticate,
    isAdmin,
    async (req: AuthedRequest, res: Response) => {
      try {
        const id = String(req.params.id);
        const { resolutionNote } = req.body as { resolutionNote?: string };

        const updated = await prisma.moderationqueue.update({
          where: { id },
          data: {
            status: "RESOLVED",
            resolvedAt: new Date(),
            resolvedById: req.user!.id,
            resolutionNote: resolutionNote?.trim()
              ? resolutionNote.trim()
              : null,
          },
        });

        return res.json(updated);
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to resolve queue item" });
      }
    }
  );

  app.patch(
    "/api/admin/users/:id/suspend",
    authenticate,
    isAdmin,
    async (req: AuthedRequest, res: Response) => {
      try {
        const id = String(req.params.id);
        const { days, reason } = req.body as { days?: number; reason?: string };

        const safeDays = Number(days);
        if (!Number.isFinite(safeDays) || safeDays <= 0) {
          return res.status(400).json({ error: "Valid days required" });
        }

        const target = await prisma.user.findUnique({
          where: { id },
          select: { id: true, username: true, role: true, isBanned: true },
        });

        if (!target) return res.status(404).json({ error: "User not found" });
        if (target.role === "ADMIN") {
          return res.status(403).json({ error: "Cannot suspend admin" });
        }
        if (target.isBanned) {
          return res.status(400).json({ error: "User is already banned" });
        }

        const suspendedUntil = new Date(Date.now() + safeDays * 24 * 60 * 60 * 1000);

        const updated = await prisma.user.update({
          where: { id },
          data: {
            suspendedUntil,
            suspendReason: reason?.trim() ? reason.trim() : "Suspended by admin",
          },
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            role: true,
            isBanned: true,
            bannedAt: true,
            banReason: true,
            suspendedUntil: true,
            suspendReason: true,
          },
        });

        const targetSocket = userSockets.get(id);
        if (targetSocket) {
          io.to(targetSocket).emit("account_action", {
            type: "SUSPENDED",
            suspendedUntil: updated.suspendedUntil,
            suspendReason: updated.suspendReason,
          });
        }

        return res.json({
          success: true,
          message: "User suspended",
          user: accountStatusPayload(updated),
        });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to suspend user" });
      }
    }
  );

  app.patch(
    "/api/admin/users/:id/unsuspend",
    authenticate,
    isAdmin,
    async (req: AuthedRequest, res: Response) => {
      try {
        const id = String(req.params.id);

        const target = await prisma.user.findUnique({
          where: { id },
          select: { id: true, username: true, role: true },
        });

        if (!target) return res.status(404).json({ error: "User not found" });
        if (target.role === "ADMIN") {
          return res.status(403).json({ error: "Cannot unsuspend admin" });
        }

        const updated = await prisma.user.update({
          where: { id },
          data: {
            suspendedUntil: null,
            suspendReason: null,
          },
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            role: true,
            isBanned: true,
            bannedAt: true,
            banReason: true,
            suspendedUntil: true,
            suspendReason: true,
          },
        });

        return res.json({
          success: true,
          message: "User unsuspended",
          user: accountStatusPayload(updated),
        });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to unsuspend user" });
      }
    }
  );

  app.patch(
    "/api/admin/users/:id/ban",
    authenticate,
    isAdmin,
    async (req: AuthedRequest, res: Response) => {
      try {
        const id = String(req.params.id);
        const { reason } = req.body as { reason?: string };

        const target = await prisma.user.findUnique({
          where: { id },
          select: { id: true, username: true, role: true, isBanned: true },
        });

        if (!target) return res.status(404).json({ error: "User not found" });
        if (target.role === "ADMIN") {
          return res.status(403).json({ error: "Cannot ban admin" });
        }
        if (target.isBanned) {
          return res.status(400).json({ error: "User already banned" });
        }

        const updated = await prisma.user.update({
          where: { id },
          data: {
            isBanned: true,
            bannedAt: new Date(),
            banReason: reason?.trim() ? reason.trim() : "Banned by admin",
            suspendedUntil: null,
            suspendReason: null,
          },
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            role: true,
            isBanned: true,
            bannedAt: true,
            banReason: true,
            suspendedUntil: true,
            suspendReason: true,
          },
        });

        const targetSocket = userSockets.get(id);
        if (targetSocket) {
          io.to(targetSocket).emit("account_action", {
            type: "BANNED",
            bannedAt: updated.bannedAt,
            banReason: updated.banReason,
          });
        }

        return res.json({
          success: true,
          message: "User banned",
          user: accountStatusPayload(updated),
        });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to ban user" });
      }
    }
  );

  app.patch(
    "/api/admin/users/:id/unban",
    authenticate,
    isAdmin,
    async (req: AuthedRequest, res: Response) => {
      try {
        const id = String(req.params.id);

        const target = await prisma.user.findUnique({
          where: { id },
          select: { id: true, username: true, role: true },
        });

        if (!target) return res.status(404).json({ error: "User not found" });
        if (target.role === "ADMIN") {
          return res.status(403).json({ error: "Cannot unban admin" });
        }

        const updated = await prisma.user.update({
          where: { id },
          data: {
            isBanned: false,
            bannedAt: null,
            banReason: null,
          },
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            role: true,
            isBanned: true,
            bannedAt: true,
            banReason: true,
            suspendedUntil: true,
            suspendReason: true,
          },
        });

        return res.json({
          success: true,
          message: "User unbanned",
          user: accountStatusPayload(updated),
        });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to unban user" });
      }
    }
  );

  app.get("/api/chats", authenticate, async (req: AuthedRequest, res: Response) => {
    try {
      const meId = req.user!.id;

      const chats = await prisma.chat.findMany({
        where: { chatparticipant: { some: { userId: meId } } },
        include: {
          chatparticipant: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  email: true,
                  avatarUrl: true,
                  role: true,
                  isBanned: true,
                  suspendedUntil: true,
                },
              },
            },
          },
          message: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { updatedAt: "desc" },
      });

      const withUnread = await Promise.all(
        chats.map(async (c) => {
          const unreadCount = await prisma.message.count({
            where: {
              chatId: c.id,
              recipientId: meId,
              seenAt: null,
              deletedAt: null,
            },
          });
          return { ...c, unreadCount };
        })
      );

      return res.json(withUnread);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Failed to fetch chats" });
    }
  });

  app.post("/api/chats", authenticate, async (req: AuthedRequest, res: Response) => {
    const { recipientId } = req.body as { recipientId?: string };
    if (!recipientId) {
      return res.status(400).json({ error: "recipientId required" });
    }
    if (recipientId === req.user!.id) {
      return res.status(400).json({ error: "Cannot chat with yourself" });
    }

    try {
      const recipient = await prisma.user.findUnique({
        where: { id: recipientId },
        select: {
          id: true,
          role: true,
          isBanned: true,
          suspendedUntil: true,
        },
      });

      if (!recipient) return res.status(404).json({ error: "User not found" });
      if (recipient.role === "ADMIN") {
        return res.status(403).json({ error: "Cannot message admin" });
      }
      if (recipient.isBanned || isActiveSuspension(recipient.suspendedUntil)) {
        return res.status(403).json({ error: "Cannot message this user right now" });
      }

      const existing = await prisma.chat.findFirst({
        where: {
          AND: [
            { chatparticipant: { some: { userId: req.user!.id } } },
            { chatparticipant: { some: { userId: recipientId } } },
          ],
        },
        include: {
          chatparticipant: { include: { user: true } },
          message: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      });

      if (existing) return res.json(existing);

      const chat = await prisma.chat.create({
        data: {
          chatparticipant: {
            create: [{ userId: req.user!.id }, { userId: recipientId }],
          },
        },
        include: {
          chatparticipant: { include: { user: true } },
          message: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      });

      return res.json(chat);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Failed to create chat" });
    }
  });

  app.get(
    "/api/chats/:id/messages",
    authenticate,
    async (req: AuthedRequest, res: Response) => {
      const chatId = String(req.params.id);
      const meId = req.user!.id;

      try {
        const chat = await assertChatAccess(chatId, meId);
        if (!chat) return res.status(403).json({ error: "Forbidden" });

        const messages = await prisma.message.findMany({
          where: { chatId, deletedAt: null },
          orderBy: { createdAt: "asc" },
        });

        return res.json(messages);
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to fetch messages" });
      }
    }
  );

  app.post(
    "/api/chats/:id/seen",
    authenticate,
    async (req: AuthedRequest, res: Response) => {
      const chatId = String(req.params.id);
      const meId = req.user!.id;

      try {
        const chat = await assertChatAccess(chatId, meId);
        if (!chat) return res.status(403).json({ error: "Forbidden" });

        const updated = await prisma.message.updateMany({
          where: {
            chatId,
            recipientId: meId,
            seenAt: null,
            deletedAt: null,
          },
          data: { seenAt: new Date() },
        });

        const otherId = getOtherParticipantId(chat, meId);
        if (otherId) {
          const otherSocket = userSockets.get(otherId);
          if (otherSocket) {
            io.to(otherSocket).emit("seen", { chatId, seenBy: meId });
          }
        }

        return res.json({ success: true, updated: updated.count });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to mark seen" });
      }
    }
  );

  app.patch("/api/messages/:id", authenticate, async (req: AuthedRequest, res: Response) => {
    const id = String(req.params.id);
    const { text } = req.body as { text?: string };

    if (!text?.trim()) return res.status(400).json({ error: "text required" });

    try {
      const msg = await prisma.message.findUnique({ where: { id } });
      if (!msg) return res.status(404).json({ error: "Message not found" });
      if (msg.senderId !== req.user!.id) {
        return res.status(403).json({ error: "Not allowed" });
      }
      if (msg.type !== "TEXT") {
        return res.status(400).json({ error: "Only TEXT can be edited" });
      }
      if (msg.deletedAt) {
        return res.status(400).json({ error: "Message deleted" });
      }

      const chat = await assertChatAccess(msg.chatId, req.user!.id);
      if (!chat) return res.status(403).json({ error: "Forbidden" });

      const clean = text.trim();
      const mod = moderateTextLocal(clean);

      const updated = await prisma.message.update({
        where: { id },
        data: mod.isSafe
          ? {
              text: clean,
              editedAt: new Date(),
              moderationMeta: JSON.stringify(mod),
              status: "visible",
              restrictedReason: null,
            }
          : {
              status: "restricted",
              restrictedReason: mod.matched || "explicit_text_local",
              text: null,
              moderationMeta: JSON.stringify(mod),
              editedAt: new Date(),
            },
      });

      if (updated.status === "restricted") {
        await prisma.moderationqueue.upsert({
          where: { messageId: updated.id },
          create: {
            kind: "TEXT",
            status: "PENDING",
            messageId: updated.id,
            chatId: updated.chatId,
            senderId: updated.senderId,
            recipientId: updated.recipientId,
            textSnapshot: clean,
            imageSnapshot: null,
            reason: updated.restrictedReason || null,
            matched: mod.matched || null,
          },
          update: {
            kind: "TEXT",
            status: "PENDING",
            textSnapshot: clean,
            imageSnapshot: null,
            reason: updated.restrictedReason || null,
            matched: mod.matched || null,
            resolvedAt: null,
            resolvedById: null,
            resolutionNote: null,
          },
        });
      } else {
        await prisma.moderationqueue.updateMany({
          where: { messageId: updated.id, status: "PENDING" },
          data: {
            status: "RESOLVED",
            resolvedAt: new Date(),
            resolvedById: null,
            resolutionNote: "Auto-cleared: sender edited message to safe text",
          },
        });
      }

      await prisma.chat.update({
        where: { id: updated.chatId },
        data: { updatedAt: new Date() },
      });

      const rSock = userSockets.get(updated.recipientId);
      const sSock = userSockets.get(updated.senderId);
      if (rSock) io.to(rSock).emit("message_updated", updated);
      if (sSock) io.to(sSock).emit("message_updated", updated);

      return res.json(updated);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Failed to edit" });
    }
  });

  app.delete("/api/messages/:id", authenticate, async (req: AuthedRequest, res: Response) => {
    const id = String(req.params.id);

    try {
      const msg = await prisma.message.findUnique({ where: { id } });
      if (!msg) return res.status(404).json({ error: "Message not found" });
      if (msg.senderId !== req.user!.id) {
        return res.status(403).json({ error: "Not allowed" });
      }
      if (msg.deletedAt) return res.json({ success: true });

      const chat = await assertChatAccess(msg.chatId, req.user!.id);
      if (!chat) return res.status(403).json({ error: "Forbidden" });

      const updated = await prisma.message.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          status: "deleted",
          text: null,
          imageUrl: null,
        },
      });

      await prisma.chat.update({
        where: { id: updated.chatId },
        data: { updatedAt: new Date() },
      });

      const rSock = userSockets.get(updated.recipientId);
      const sSock = userSockets.get(updated.senderId);
      if (rSock) {
        io.to(rSock).emit("message_deleted", {
          id: updated.id,
          chatId: updated.chatId,
        });
      }
      if (sSock) {
        io.to(sSock).emit("message_deleted", {
          id: updated.id,
          chatId: updated.chatId,
        });
      }

      return res.json({ success: true });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Failed to delete" });
    }
  });

  app.post(
    "/api/chats/message",
    authenticate,
    upload.single("image"),
    async (req: AuthedRequest, res: Response) => {
      const { chatId, recipientId, text, type } = req.body as {
        chatId?: string;
        recipientId?: string;
        text?: string;
        type?: string;
      };

      const file = (req as any).file as Express.Multer.File | undefined;

      if (!chatId || !recipientId || !type) {
        return res
          .status(400)
          .json({ error: "chatId, recipientId, type required" });
      }

      try {
        const meId = req.user!.id;

        const recipient = await prisma.user.findUnique({
          where: { id: String(recipientId) },
          select: {
            id: true,
            role: true,
            isBanned: true,
            suspendedUntil: true,
          },
        });

        if (!recipient) return res.status(404).json({ error: "Recipient not found" });
        if (recipient.isBanned || isActiveSuspension(recipient.suspendedUntil)) {
          return res.status(403).json({ error: "Cannot send to this user right now" });
        }

        const chat = await assertChatAccess(String(chatId), meId);
        if (!chat) return res.status(403).json({ error: "Forbidden" });

        const recipientInChat = chat.chatparticipant.some(
          (p: any) => p.userId === String(recipientId)
        );
        if (!recipientInChat) {
          return res.status(400).json({ error: "recipientId not in chat" });
        }

        if (type === "TEXT") {
          const clean = (text || "").trim();
          if (!clean) {
            return res
              .status(400)
              .json({ error: "text required for TEXT type" });
          }

          const mod = moderateTextLocal(clean);

          const message = await prisma.message.create({
            data: {
              chatId: String(chatId),
              senderId: String(meId),
              recipientId: String(recipientId),
              type: "TEXT",
              text: mod.isSafe ? clean : null,
              imageUrl: null,
              status: mod.isSafe ? "visible" : "restricted",
              restrictedReason: mod.isSafe
                ? null
                : mod.matched || "explicit_text_local",
              moderationMeta: JSON.stringify(mod),
            },
          });

          if (!mod.isSafe) {
            await prisma.moderationqueue.create({
              data: {
                kind: "TEXT",
                status: "PENDING",
                messageId: message.id,
                chatId: message.chatId,
                senderId: message.senderId,
                recipientId: message.recipientId,
                textSnapshot: clean,
                imageSnapshot: null,
                reason: message.restrictedReason,
                matched: mod.matched || null,
              },
            });
          }

          await prisma.chat.update({
            where: { id: String(chatId) },
            data: { updatedAt: new Date() },
          });

          const rSock = userSockets.get(String(recipientId));
          const sSock = userSockets.get(String(meId));
          if (rSock) io.to(rSock).emit("message", message);
          if (sSock) io.to(sSock).emit("message", message);

          return res.json(message);
        }

        if (type === "IMAGE") {
          if (!file) {
            return res
              .status(400)
              .json({ error: "Image file required for IMAGE type" });
          }

          const moderation = (await moderateImageLocal(
            file.buffer
          )) as ImageModerationResult;

          console.log("NUDENET IMAGE MODERATION RESULT:", moderation);

          const explicitReason = getImageModerationReason(moderation);
          const explicitMatched = getImageModerationMatched(moderation);

          if (moderation.isExplicit) {
            const restrictedPath = saveLocalDMImage(
              file.buffer,
              file.mimetype,
              "dm_restricted"
            );

            const message = await prisma.message.create({
              data: {
                chatId: String(chatId),
                senderId: String(meId),
                recipientId: String(recipientId),
                type: "IMAGE",
                text: null,
                imageUrl: null,
                status: "restricted",
                restrictedReason: explicitReason,
                moderationMeta: JSON.stringify(moderation),
              },
            });

            await prisma.moderationqueue.create({
              data: {
                kind: "IMAGE",
                status: "PENDING",
                messageId: message.id,
                chatId: message.chatId,
                senderId: message.senderId,
                recipientId: message.recipientId,
                textSnapshot: null,
                imageSnapshot: restrictedPath,
                reason: explicitReason,
                matched: explicitMatched,
              },
            });

            await prisma.chat.update({
              where: { id: String(chatId) },
              data: { updatedAt: new Date() },
            });

            const restrictedMessage = {
              ...message,
              imageUrl: null,
              status: "restricted",
              restrictedReason: explicitReason,
            };

            const rSock = userSockets.get(String(recipientId));
            const sSock = userSockets.get(String(meId));
            if (rSock) io.to(rSock).emit("message", restrictedMessage);
            if (sSock) io.to(sSock).emit("message", restrictedMessage);

            return res.json(restrictedMessage);
          }

          if (moderation.needsReview) {
            const reviewPath = saveLocalDMImage(
              file.buffer,
              file.mimetype,
              "dm_restricted"
            );

            const message = await prisma.message.create({
              data: {
                chatId: String(chatId),
                senderId: String(meId),
                recipientId: String(recipientId),
                type: "IMAGE",
                text: null,
                imageUrl: null,
                status: "pending_review",
                restrictedReason: explicitReason,
                moderationMeta: JSON.stringify(moderation),
              },
            });

            await prisma.moderationqueue.create({
              data: {
                kind: "IMAGE",
                status: "PENDING",
                messageId: message.id,
                chatId: message.chatId,
                senderId: message.senderId,
                recipientId: message.recipientId,
                textSnapshot: null,
                imageSnapshot: reviewPath,
                reason: explicitReason,
                matched: explicitMatched,
              },
            });

            await prisma.chat.update({
              where: { id: String(chatId) },
              data: { updatedAt: new Date() },
            });

            const pendingMessage = {
              ...message,
              imageUrl: null,
              status: "pending_review",
              restrictedReason: explicitReason,
            };

            const rSock = userSockets.get(String(recipientId));
            const sSock = userSockets.get(String(meId));
            if (rSock) io.to(rSock).emit("message", pendingMessage);
            if (sSock) io.to(sSock).emit("message", pendingMessage);

            return res.json(pendingMessage);
          }

          const publicPath = saveLocalDMImage(
            file.buffer,
            file.mimetype,
            "dm_public"
          );

          const safeMessage = await prisma.message.create({
            data: {
              chatId: String(chatId),
              senderId: String(meId),
              recipientId: String(recipientId),
              type: "IMAGE",
              text: null,
              imageUrl: publicPath,
              status: "visible",
              moderationMeta: JSON.stringify(moderation),
              restrictedReason: null,
            },
          });

          await prisma.chat.update({
            where: { id: String(chatId) },
            data: { updatedAt: new Date() },
          });

          const rSock = userSockets.get(String(recipientId));
          const sSock = userSockets.get(String(meId));
          if (rSock) io.to(rSock).emit("message", safeMessage);
          if (sSock) io.to(sSock).emit("message", safeMessage);

          return res.json(safeMessage);
        }

        return res.status(400).json({ error: "Invalid type. Use TEXT or IMAGE" });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to send message" });
      }
    }
  );

  app.get(
    "/api/users/:username",
    authenticate,
    async (req: AuthedRequest, res: Response) => {
      try {
        const u = await prisma.user.findUnique({
          where: { username: String(req.params.username) },
          include: {
            post: true,
          },
        });

        if (!u) return res.status(404).json({ error: "User not found" });

        const posts = u.post ?? [];

        return res.json({
          id: u.id,
          username: u.username,
          email: u.email,
          bio: u.bio,
          avatarUrl: u.avatarUrl,
          role: u.role,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
          posts,
          counts: {
            posts: posts.length,
          },
        });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Failed to load profile" });
      }
    }
  );

  app.put("/api/users/me", authenticate, async (req: any, res) => {
    try {
      const { bio, avatarBase64 } = req.body;

      const cleanedBio =
        typeof bio === "string" && bio.trim().length > 0 ? bio.trim() : null;

      const updateData: any = {
        bio: cleanedBio,
      };

      if (avatarBase64 && typeof avatarBase64 === "string") {
        updateData.avatarUrl = avatarBase64;
      }

      const updatedUser = await prisma.user.update({
        where: { id: req.user.id },
        data: updateData,
        select: {
          id: true,
          username: true,
          email: true,
          bio: true,
          avatarUrl: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return res.json(updatedUser);
    } catch (err) {
      console.error("Profile update failed:", err);
      return res.status(500).json({ error: "Profile update failed" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();