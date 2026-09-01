"use client";

import { FormEvent, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function NewEvidencePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const controlId = Number(params.id);

  const [evidenceName, setEvidenceName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setErrorMessage("");

    if (!Number.isInteger(controlId)) {
      setErrorMessage("رقم الضابط غير صحيح.");
      return;
    }

    if (!evidenceName.trim()) {
      setErrorMessage("يرجى إدخال اسم الدليل.");
      return;
    }

    if (!file) {
      setErrorMessage("يرجى اختيار ملف.");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setErrorMessage("حجم الملف يجب ألا يتجاوز 20 MB.");
      return;
    }

    setUploading(true);

    try {
      // Clean file name
      const safeFileName = file.name
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9._-]/g, "");

      // Every control gets its own folder
      const storagePath =
        `${controlId}/${Date.now()}-${safeFileName}`;

      // 1. Upload file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("evidence-files")
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) {
        throw new Error(
          `تعذر رفع الملف: ${uploadError.message}`
        );
      }

      // 2. Save evidence metadata in database
      const { error: insertError } = await supabase
        .from("evidence")
        .insert({
          control_id: controlId,
          evidence_name: evidenceName.trim(),
          description: description.trim() || null,
          file_name: file.name,
          file_path: storagePath,
          mime_type: file.type || null,
          file_size: file.size,
          status: "pending_review",
          uploaded_at: new Date().toISOString(),
          is_current: true,
        });

      if (insertError) {
        // If DB insert fails, remove uploaded file
        await supabase.storage
          .from("evidence-files")
          .remove([storagePath]);

        throw new Error(
          `تم رفع الملف ولكن تعذر تسجيل الدليل: ${insertError.message}`
        );
      }

      setMessage("تم رفع الدليل وربطه بالضابط بنجاح.");

      setTimeout(() => {
        router.push(`/controls/${controlId}`);
        router.refresh();
      }, 800);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "حدث خطأ غير متوقع.";

      setErrorMessage(message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <main
      dir="rtl"
      style={{
        minHeight: "100vh",
        background: "#f5f7f9",
        fontFamily: "Arial, sans-serif",
        color: "#0b1f33",
      }}
    >
      {/* Header */}
      <header
        style={{
          height: "86px",
          background: "#0b1f33",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 38px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "24px",
              fontWeight: "bold",
            }}
          >
            Cyber Governance Platform
          </div>

          <div
            style={{
              fontSize: "13px",
              opacity: 0.7,
              marginTop: "5px",
            }}
          >
            منصة حوكمة الأمن السيبراني
          </div>
        </div>

        <div style={{ fontSize: "14px" }}>
          دورة التقييم: 2026
        </div>
      </header>

      <div
        style={{
          maxWidth: "850px",
          margin: "0 auto",
          padding: "38px 25px 60px",
        }}
      >
        <Link
          href={`/controls/${controlId}`}
          style={{
            color: "#0f7d73",
            textDecoration: "none",
            fontWeight: "bold",
          }}
        >
          ← العودة إلى الضابط
        </Link>

        <div
          style={{
            marginTop: "24px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              color: "#0f7d73",
              fontSize: "14px",
              fontWeight: "bold",
              marginBottom: "8px",
            }}
          >
            Control ID: {controlId}
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: "32px",
            }}
          >
            رفع دليل
          </h1>

          <p
            style={{
              color: "#7a8794",
              marginTop: "10px",
            }}
          >
            ارفع الملف وأضف وصفًا واضحًا للدليل المطلوب.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            background: "white",
            border: "1px solid #e2e7eb",
            borderRadius: "16px",
            padding: "28px",
          }}
        >
          {/* Evidence Name */}
          <FieldLabel text="اسم الدليل *" />

          <input
            type="text"
            value={evidenceName}
            onChange={(e) =>
              setEvidenceName(e.target.value)
            }
            placeholder="مثال: استراتيجية الأمن السيبراني المعتمدة"
            style={inputStyle}
          />

          {/* Description */}
          <div style={{ height: "22px" }} />

          <FieldLabel text="وصف الدليل" />

          <textarea
            value={description}
            onChange={(e) =>
              setDescription(e.target.value)
            }
            placeholder="اكتب وصفًا مختصرًا للدليل..."
            rows={5}
            style={{
              ...inputStyle,
              resize: "vertical",
              minHeight: "110px",
            }}
          />

          {/* File */}
          <div style={{ height: "22px" }} />

          <FieldLabel text="الملف *" />

          <label
            style={{
              display: "block",
              border: "2px dashed #cfd7dd",
              borderRadius: "14px",
              padding: "34px 20px",
              textAlign: "center",
              cursor: "pointer",
              background: "#fafbfc",
            }}
          >
            <div
              style={{
                fontSize: "34px",
                marginBottom: "10px",
              }}
            >
              📎
            </div>

            <div
              style={{
                fontWeight: "bold",
                marginBottom: "7px",
              }}
            >
              {file
                ? file.name
                : "اضغط لاختيار الملف"}
            </div>

            <div
              style={{
                color: "#7a8794",
                fontSize: "13px",
              }}
            >
              PDF, Word, Excel أو صورة — بحد أقصى 20 MB
            </div>

            <input
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
              onChange={(e) => {
                const selected =
                  e.target.files?.[0] ?? null;

                setFile(selected);
                setErrorMessage("");
              }}
              style={{
                display: "none",
              }}
            />
          </label>

          {file && (
            <div
              style={{
                marginTop: "10px",
                color: "#5f6b76",
                fontSize: "13px",
              }}
            >
              الحجم:{" "}
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </div>
          )}

          {/* Errors */}
          {errorMessage && (
            <div
              style={{
                marginTop: "20px",
                background: "#fff1f0",
                color: "#b42318",
                padding: "13px 15px",
                borderRadius: "9px",
              }}
            >
              {errorMessage}
            </div>
          )}

          {/* Success */}
          {message && (
            <div
              style={{
                marginTop: "20px",
                background: "#e8f5f2",
                color: "#0f6f67",
                padding: "13px 15px",
                borderRadius: "9px",
              }}
            >
              {message}
            </div>
          )}

          {/* Actions */}
          <div
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: "flex-start",
              marginTop: "28px",
            }}
          >
            <button
              type="submit"
              disabled={uploading}
              style={{
                border: 0,
                background: uploading
                  ? "#91aaa6"
                  : "#0f7d73",
                color: "white",
                padding: "13px 22px",
                borderRadius: "9px",
                fontWeight: "bold",
                cursor: uploading
                  ? "not-allowed"
                  : "pointer",
              }}
            >
              {uploading
                ? "جاري الرفع..."
                : "رفع وإرسال للمراجعة"}
            </button>

            <Link
              href={`/controls/${controlId}`}
              style={{
                border: "1px solid #d9dee3",
                color: "#44515c",
                background: "white",
                padding: "12px 20px",
                borderRadius: "9px",
                textDecoration: "none",
                fontWeight: "bold",
              }}
            >
              إلغاء
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}

function FieldLabel({
  text,
}: {
  text: string;
}) {
  return (
    <div
      style={{
        fontSize: "14px",
        fontWeight: "bold",
        color: "#34414c",
        marginBottom: "8px",
      }}
    >
      {text}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  border: "1px solid #d9dee3",
  borderRadius: "10px",
  padding: "13px 14px",
  fontSize: "14px",
  background: "white",
  color: "#26323d",
  outline: "none",
};