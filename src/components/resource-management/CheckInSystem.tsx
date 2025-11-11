// @ts-nocheck
import React, { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, CheckCircle, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import jsQR from "jsqr";

export function CheckInSystem() {
  const [uploading, setUploading] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ------------------------------
  // File Upload Handler
  // ------------------------------
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setVerificationResult(null);

    try {
      const imageData = await readImageFile(file);
      const qrData = decodeQR(imageData);

      if (!qrData) throw new Error("No QR code found in the image.");

      await verifyAndCheckIn(qrData);
    } catch (error: any) {
      console.error("Error processing QR code:", error);
      toast.error(error.message);
      setVerificationResult({ success: false, message: error.message });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ------------------------------
  // Utility: Read Image File
  // ------------------------------
  const readImageFile = (file: File): Promise<ImageData> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("Failed to get canvas context"));
          ctx.drawImage(img, 0, 0);
          resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
        };
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  };

  // ------------------------------
  // Utility: Decode QR Code
  // ------------------------------
  const decodeQR = (imageData: ImageData): string | null => {
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    return code?.data || null;
  };

  // ------------------------------
  // Verify and Check-In
  // ------------------------------
  const verifyAndCheckIn = async (qrData: string) => {
    try {
      const payload = JSON.parse(qrData);
      const { order_id, registration_id, event_id, user_id } = payload;

      if (!event_id || !user_id)
        throw new Error("QR code missing event_id or user_id");

      console.log("🧾 QR Data:", payload);

      // Load profile (for displaying info)
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, email")
        .eq("id", user_id)
        .maybeSingle();

      // ---- Paid Event (order_id present)
      if (order_id) {
        const { data: order } = await supabase
          .from("orders")
          .select("payment_status")
          .eq("id", order_id)
          .maybeSingle();

        const paymentStatus = order?.payment_status?.toLowerCase() || "";

        console.log("💳 Payment Status:", paymentStatus);

        if (
          !["completed", "success", "paid"].includes(paymentStatus)
        ) {
          console.warn("⚠️ Payment not marked completed:", paymentStatus);
          // We still allow check-in to proceed.
        }
      }

      // ---- Free Event (registration_id present)
      if (registration_id) {
        const { data: reg } = await supabase
          .from("registrations")
          .select("id, registration_status")
          .eq("id", registration_id)
          .maybeSingle();

        const status = reg?.registration_status?.toLowerCase() || "";
        console.log("🎟 Registration Status:", status);

        if (
          !["confirmed", "success", "paid"].includes(status)
        ) {
          console.warn("⚠️ Registration not confirmed:", status);
        }
      }

      // Proceed to check-in
      await performCheckIn(user_id, event_id, profile, registration_id);
    } catch (err: any) {
      console.error("Verify error:", err);
      toast.error(err.message);
      setVerificationResult({ success: false, message: err.message });
    }
  };

  // ------------------------------
  // Perform Check-In
  // ------------------------------
  const performCheckIn = async (user_id, event_id, profile, registration_id) => {
    try {
      // Check if already checked-in
      const { data: existing } = await supabase
        .from("checkins")
        .select("id")
        .eq("participant_id", user_id)
        .eq("event_id", event_id)
        .limit(1);

      if (existing && existing.length > 0) {
        setVerificationResult({
          success: false,
          message: "This attendee has already been checked in.",
          attendee: { user: profile },
        });
        toast("Already checked in");
        return;
      }

      // Find allocated resource (optional)
      const { data: allocation } = await supabase
        .from("resource_allocations")
        .select("resource_id")
        .eq("event_id", event_id)
        .maybeSingle();

      const resourceId = allocation?.resource_id || null;

      // Insert check-in record
      const { error: insertError } = await supabase.from("checkins").insert({
        participant_id: user_id,
        event_id,
        resource_id: resourceId,
        status: "checked_in",
      });

      if (insertError) {
        console.error("Insert failed:", insertError);
        throw new Error("Database insert failed: " + insertError.message);
      }

      // Update registration if exists
      if (registration_id) {
        await supabase
          .from("registrations")
          .update({ checked_in_at: new Date().toISOString() })
          .eq("id", registration_id);
      }

      setVerificationResult({
        success: true,
        message: "Check-in successful!",
        attendee: { user: profile },
      });
      toast.success("Attendee checked in successfully!");
    } catch (err: any) {
      console.error("Check-in error:", err);
      toast.error(err.message);
      setVerificationResult({ success: false, message: err.message });
    }
  };

  // ------------------------------
  // UI
  // ------------------------------
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>QR Code Check-In System</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Upload a QR code image to verify and check-in attendees.
          </p>

          <div className="flex flex-col items-center gap-4 p-8 border-2 border-dashed rounded-lg">
            <Upload className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <p className="font-medium mb-2">Upload QR Code Image</p>
              <p className="text-sm text-muted-foreground mb-4">
                Supports JPG, PNG, and other image formats
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
                data-testid="qr-upload"
              />

              <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? "Processing..." : "Select QR Code Image"}
              </Button>
            </div>
          </div>

          {verificationResult && (
            <Alert variant={verificationResult.success ? "default" : "destructive"}>
              {verificationResult.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">{verificationResult.message}</p>
                  {verificationResult.attendee && (
                    <div className="text-sm mt-2">
                      <p>
                        <strong>Name:</strong>{" "}
                        {verificationResult.attendee.user?.display_name || "N/A"}
                      </p>
                      <p>
                        <strong>Email:</strong>{" "}
                        {verificationResult.attendee.user?.email || "N/A"}
                      </p>
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
