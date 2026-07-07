import { Router } from "express";
import {
  fetchProfile,
  fetchUserInfo,
  fetchPost,
  fetchReels,
  fetchHashtag,
  fetchStories,
  fetchUserFeed,
  fetchComments,
  fetchCustomGraphQL,
} from "../lib/instagram.js";
import type { GraphQLInput } from "@workspace/api-zod";

const router = Router();

function proxyStatus(statusCode: number): number {
  // Always return 200 for upstream responses so the frontend receives the full
  // JSON payload (with success/error fields) rather than a raw HTTP error.
  // The only exception is a total network failure (statusCode === 0) → 502.
  if (statusCode === 0) return 502;
  return 200;
}

// GET /instagram/profile?username=
router.get("/instagram/profile", async (req, res) => {
  const { username } = req.query as { username?: string };
  if (!username) {
    res.status(400).json({ success: false, error: "username query parameter is required" });
    return;
  }
  const result = await fetchProfile(username);
  res.status(proxyStatus(result.statusCode)).json(result);
});

// GET /instagram/user/:userId
router.get("/instagram/user/:userId", async (req, res) => {
  const { userId } = req.params;
  const result = await fetchUserInfo(userId);
  res.status(proxyStatus(result.statusCode)).json(result);
});

// GET /instagram/post/:shortcode
router.get("/instagram/post/:shortcode", async (req, res) => {
  const { shortcode } = req.params;
  const result = await fetchPost(shortcode);
  res.status(proxyStatus(result.statusCode)).json(result);
});

// GET /instagram/reels/:shortcode
router.get("/instagram/reels/:shortcode", async (req, res) => {
  const { shortcode } = req.params;
  const result = await fetchReels(shortcode);
  res.status(proxyStatus(result.statusCode)).json(result);
});

// GET /instagram/hashtag?tag=&after=
router.get("/instagram/hashtag", async (req, res) => {
  const { tag, after } = req.query as { tag?: string; after?: string };
  if (!tag) {
    res.status(400).json({ success: false, error: "tag query parameter is required" });
    return;
  }
  const result = await fetchHashtag(tag, after);
  res.status(proxyStatus(result.statusCode)).json(result);
});

// GET /instagram/stories
router.get("/instagram/stories", async (_req, res) => {
  const result = await fetchStories();
  res.status(proxyStatus(result.statusCode)).json(result);
});

// GET /instagram/feed?userId=&after=
router.get("/instagram/feed", async (req, res) => {
  const { userId, after } = req.query as { userId?: string; after?: string };
  if (!userId) {
    res.status(400).json({ success: false, error: "userId query parameter is required" });
    return;
  }
  const result = await fetchUserFeed(userId, after);
  res.status(proxyStatus(result.statusCode)).json(result);
});

// GET /instagram/comments?shortcode=&after=
router.get("/instagram/comments", async (req, res) => {
  const { shortcode, after } = req.query as { shortcode?: string; after?: string };
  if (!shortcode) {
    res.status(400).json({ success: false, error: "shortcode query parameter is required" });
    return;
  }
  const result = await fetchComments(shortcode, after);
  res.status(proxyStatus(result.statusCode)).json(result);
});

// POST /instagram/graphql
router.post("/instagram/graphql", async (req, res) => {
  const { docId, variables } = req.body as GraphQLInput;
  if (!docId) {
    res.status(400).json({ success: false, error: "docId is required" });
    return;
  }
  const result = await fetchCustomGraphQL(docId, variables ?? {});
  res.status(proxyStatus(result.statusCode)).json(result);
});

export default router;
