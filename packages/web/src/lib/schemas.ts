import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
});

export const credentialsSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const startQuizSchema = z.object({
  sessionId: z.string().min(1),
  questionCount: z.number().int().min(1).max(10).optional(),
});

export const answerQuizSchema = z.object({
  sessionId: z.string().min(1),
  quizId: z.string().min(1),
  questionIndex: z.number().int().min(0),
  answer: z.string().min(1),
});