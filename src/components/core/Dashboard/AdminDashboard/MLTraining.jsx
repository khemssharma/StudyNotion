import React, { useState } from "react";
import { useSelector } from "react-redux";
import { apiConnector } from "../../../../services/apiconnector";
import { mlEndpoints } from "../../../../services/apis";
import { toast } from "react-hot-toast";

export default function MLTraining() {
  const { token } = useSelector((s) => s.auth);
  const headers = { Authorization: `Bearer ${token}` };

  const [status, setStatus]     = useState("idle"); // idle | loading | success | error
  const [result, setResult]     = useState(null);
  const [logs, setLogs]         = useState([]);

  const addLog = (msg) => setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

  const triggerTraining = async () => {
    if (status === "loading") return;
    setStatus("loading");
    setResult(null);
    addLog("Sending training request to backend...");

    try {
      const res = await apiConnector(
        "POST",
        mlEndpoints.ML_TRAIN_API,
        null,
        headers
      );

      if (res?.data?.success) {
        setStatus("success");
        setResult(res.data);
        addLog(`Training complete: ${res.data.mlResponse?.message || "Success"}`);
        toast.success("ML model retraining triggered successfully!");
      } else {
        setStatus("error");
        addLog(`Error: ${res?.data?.message || "Unknown error"}`);
        toast.error(res?.data?.message || "Training failed");
      }
    } catch (err) {
      setStatus("error");
      const msg = err?.response?.data?.message || err.message || "Request failed";
      addLog(`Exception: ${msg}`);
      toast.error(msg);
    }
  };

  return (
    <div className="mx-auto max-w-maxContent px-4 py-8 text-richblack-5">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">🧪 ML Training</h1>
        <p className="text-richblack-300 mt-1 text-sm">
          Trigger the hybrid recommendation model to retrain on the latest platform data.
        </p>
      </div>

      {/* Info Banner */}
      <div className="rounded-xl border border-blue-500/30 bg-blue-900/10 p-5 mb-8">
        <h2 className="font-semibold text-blue-400 mb-2">How It Works</h2>
        <ul className="text-sm text-richblack-300 space-y-1 list-disc list-inside">
          <li>The backend fetches all published courses and student data from MongoDB.</li>
          <li>It sends this data to the Python Flask ML microservice (<code className="text-yellow-400">POST /train</code>).</li>
          <li>The ML service trains a <strong>TF-IDF content-based</strong> + <strong>collaborative filtering</strong> hybrid model.</li>
          <li>Model artifacts are saved to disk — future recommendations will use the new model.</li>
          <li>This also runs automatically every night via the GitHub Actions cron job.</li>
        </ul>
      </div>

      {/* Trigger Button */}
      <div className="rounded-xl border border-richblack-700 bg-richblack-800 p-6 mb-8 flex flex-col items-center gap-4">
        <p className="text-richblack-300 text-sm text-center max-w-md">
          Click the button below to manually trigger a full model retrain.
          This may take 30–120 seconds depending on the volume of data.
        </p>
        <button
          onClick={triggerTraining}
          disabled={status === "loading"}
          className={`px-8 py-3 rounded-lg font-semibold text-sm transition ${
            status === "loading"
              ? "bg-richblack-600 text-richblack-300 cursor-not-allowed"
              : "bg-yellow-50 text-richblack-900 hover:bg-yellow-100 active:scale-95"
          }`}
        >
          {status === "loading" ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin w-4 h-4 border-2 border-richblack-400 border-t-transparent rounded-full inline-block"></span>
              Training in progress...
            </span>
          ) : (
            "🚀 Trigger ML Retraining"
          )}
        </button>

        {/* Status badge */}
        {status !== "idle" && (
          <span className={`text-xs font-mono px-3 py-1 rounded-full border ${
            status === "loading" ? "border-yellow-500/40 text-yellow-400 bg-yellow-900/10" :
            status === "success" ? "border-green-500/40 text-green-400 bg-green-900/10" :
            "border-red-500/40 text-red-400 bg-red-900/10"
          }`}>
            {status === "loading" ? "Training..." : status === "success" ? "Training Successful" : "Training Failed"}
          </span>
        )}
      </div>

      {/* Result */}
      {result && (
        <div className="rounded-xl border border-green-500/30 bg-green-900/10 p-5 mb-6">
          <h2 className="font-semibold text-green-400 mb-2">Result</h2>
          <pre className="text-xs text-richblack-200 overflow-x-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}

      {/* Log */}
      {logs.length > 0 && (
        <div className="rounded-xl border border-richblack-700 bg-richblack-900 p-4">
          <h2 className="font-semibold text-richblack-300 mb-2 text-sm">Activity Log</h2>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {logs.map((log, i) => (
              <p key={i} className="text-xs font-mono text-richblack-400">{log}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}