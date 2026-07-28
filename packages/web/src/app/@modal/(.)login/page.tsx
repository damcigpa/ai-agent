"use client";

import { useRouter } from "next/navigation";
import { Modal } from "../../../components/Modal";
import { LoginForm } from "../../../components/LoginForm";

export default function LoginModal() {
  const router = useRouter();

  return (
    <Modal>
      <LoginForm onSuccess={() => router.back()} />
    </Modal>
  );
}
