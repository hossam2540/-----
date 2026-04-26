/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import { 
  Stethoscope, 
  Thermometer, 
  Calendar, 
  Activity, 
  AlertCircle, 
  ChevronRight, 
  ChevronLeft, 
  ChevronDown,
  ChevronUp,
  RefreshCcw, 
  ExternalLink,
  MessageSquare,
  ClipboardList,
  CheckCircle2,
  Info,
  Image as ImageIcon,
  Upload,
  X as CloseIcon
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import React, { useState, useEffect, useRef } from "react";

// --- Types ---

interface AnimalInfo {
  type: string;
  age: string;
  gender: string;
}

interface MedicalHistory {
  isNewlyPurchased: string;
  isVaccinated: string;
  previousOccurrences: string;
  contactWithSick: string;
  dietChange: string;
}

interface DiagnosisResult {
  mostLikely: {
    name: string;
    probability: number;
    description: string;
    treatmentPlan: string[];
    prognosis: string;
    testsNeeded: string[];
    isZoonotic: boolean;
    urgency: "low" | "medium" | "high" | "critical";
    preventionTips: string[];
  };
  differentials: Array<{
    name: string;
    probability: number;
    keySymptoms: string;
    briefTreatment: string;
  }>;
  disclaimer: string;
  sources: string[];
}

interface FollowUpQuestion {
  id: string;
  question: string;
  options?: string[];
  type: "text" | "choice";
}

// --- Gemini Config ---

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// --- Components ---

export default function App() {
  const [step, setStep] = useState<"info" | "symptoms" | "followup" | "results">("info");
  const [animalInfo, setAnimalInfo] = useState<AnimalInfo>({ type: "", age: "", gender: "" });
  const [medicalHistory, setMedicalHistory] = useState<MedicalHistory>({
    isNewlyPurchased: "",
    isVaccinated: "",
    previousOccurrences: "",
    contactWithSick: "",
    dietChange: ""
  });
  const [initialSymptoms, setInitialSymptoms] = useState("");
  const [temperature, setTemperature] = useState("");
  const [previousTreatments, setPreviousTreatments] = useState("");
  const [followupQuestions, setFollowupQuestions] = useState<FollowUpQuestion[]>([]);
  const [followupAnswers, setFollowupAnswers] = useState<Record<string, string>>({});
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [selectedImages, setSelectedImages] = useState<Array<{ base64: string; mimeType: string }>>([]);
  const [expandedDiff, setExpandedDiff] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.dir = "rtl";
    document.documentElement.lang = "ar";
  }, []);

  // --- Logic --- (Preserved)
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach((file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(",")[1];
          setSelectedImages(prev => [...prev, { base64, mimeType: file.type }]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleInitialSubmit = async () => {
    if (!animalInfo.type || !initialSymptoms) {
      setError("يرجى ملء البيانات الأساسية والأعراض.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const prompt = `أنت طبيب بيطري خبير ومساعد تشخيصي متخصص في كافة أنواع الحيوانات بما في ذلك الحيوانات الكبيرة، والحيوانات الأليفة، والدواجن (Avian Pathology).
      
      البيانات الحالية: 
      - نوع الحيوان: ${animalInfo.type}
      - العمر: ${animalInfo.age}
      - الجنس: ${animalInfo.gender}
      - درجة الحرارة: ${temperature}
      - التاريخ المرضي (Medical History):
        * هل مشتراة حديثاً؟: ${medicalHistory.isNewlyPurchased}
        * هل هي محصنة؟: ${medicalHistory.isVaccinated}
        * هل ظهرت الأعراض سابقاً؟: ${medicalHistory.previousOccurrences}
        * هل خالطت حيوانات مريضة؟: ${medicalHistory.contactWithSick}
        * هل حدث تغيير في العلف/النظام الغذائي؟: ${medicalHistory.dietChange}
      - الأعراض الأولية: ${initialSymptoms}
      - العلاجات السابقة والاستجابة: ${previousTreatments || "لا يوجد"}
      
      هل تحتاج لأسئلة توضيحية؟ أرجع JSON. ${selectedImages.length > 0 ? "قم بتحليل الصور المرفقة للحالة لزيادة دقة الاقتراحات." : ""}`;
      
      const contents = selectedImages.length > 0 
        ? { parts: [
            ...selectedImages.map(img => ({ inlineData: { data: img.base64, mimeType: img.mimeType } })),
            { text: prompt }
          ]}
        : prompt;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: contents,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    question: { type: Type.STRING },
                    type: { type: Type.STRING, enum: ["text", "choice"] },
                    options: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["id", "question", "type"]
                }
              },
              readyForDiagnosis: { type: Type.BOOLEAN }
            },
            required: ["questions", "readyForDiagnosis"]
          }
        }
      });
      const result = JSON.parse(response.text);
      if (result.readyForDiagnosis || result.questions.length === 0) {
        await generateFinalDiagnosis();
      } else {
        setFollowupQuestions(result.questions);
        setStep("followup");
      }
    } catch (err) {
      setError("حدث خطأ أثناء معالجة البيانات.");
    } finally {
      setIsLoading(false);
    }
  };

  const generateFinalDiagnosis = async () => {
    setIsLoading(true);
    try {
      const answersText = Object.entries(followupAnswers).map(([id, ans]) => `س: ${followupQuestions.find(q => q.id === id)?.question} | ج: ${ans}`).join("\n");
      const prompt = `أنت طبيب بيطري خبير ملم بأحدث المصادر العلمية في طب الحيوان والدواجن. قدم تشخيصاً مفصلاً واحترافياً. 
      البيانات: 
      - النوع: ${animalInfo.type}
      - العمر: ${animalInfo.age}
      - الحرارة: ${temperature}
      - التاريخ المرضي: ${JSON.stringify(medicalHistory)}
      - الأعراض: ${initialSymptoms}
      - العلاجات السابقة: ${previousTreatments || "لا يوجد"}
      - الإجابات الإضافية: ${answersText}. 
      ${selectedImages.length > 0 ? "اعتمد أيضاً على تحليل الصور المرفقة في التشخيص النهائي." : ""}
      
      هام جداً: إذا كان النوع "دواجن"، يرجى مراعاة الأمراض الفيروسية والبكتيرية والطفيلية الشائعة في مزارع الدواجن (مثل Newcastle, IB, IBD, Coccidiosis, Mycoplasmosis, etc.).
      
      استخدم المعلومات الخاصة بالعلاجات السابقة لاستبعاد الأمراض التي لا تستجيب لهذه العلاجات أو لتأكيد أمراض معينة بناءً على فشل البروتوكول العلاجي السابق.
      
      يجب أن يتضمن التشخيص: اسم المرض، الاحتمالية، وصف سردي، خطة علاج دقيقة (بما في ذلك العلاج الجماعي في حال الدواجن)، المآل (Prognosis)، الفحوصات المخبرية المقترحة لتأكيد التشخيص، هل المرض مشترك بين الإنسان والحيوان (Zoonotic)، درجة الاستعجال، ونصائح الوقاية لصاحب الحيوان.`;
      
      const contents = selectedImages.length > 0 
        ? { parts: [
            ...selectedImages.map(img => ({ inlineData: { data: img.base64, mimeType: img.mimeType } })),
            { text: prompt }
          ]}
        : prompt;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: contents,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              mostLikely: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  probability: { type: Type.NUMBER },
                  description: { type: Type.STRING },
                  treatmentPlan: { type: Type.ARRAY, items: { type: Type.STRING } },
                  prognosis: { type: Type.STRING },
                  testsNeeded: { type: Type.ARRAY, items: { type: Type.STRING } },
                  isZoonotic: { type: Type.BOOLEAN },
                  urgency: { type: Type.STRING, enum: ["low", "medium", "high", "critical"] },
                  preventionTips: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
              },
              differentials: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    probability: { type: Type.NUMBER },
                    keySymptoms: { type: Type.STRING },
                    briefTreatment: { type: Type.STRING }
                  }
                }
              },
              disclaimer: { type: Type.STRING },
              sources: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
          }
        }
      });
      setDiagnosis(JSON.parse(response.text));
      setStep("results");
    } catch (err) {
      setError("فشل في استخراج التشخيص.");
    } finally {
      setIsLoading(false);
    }
  };

  const resetAll = () => {
    setStep("info");
    setAnimalInfo({ type: "", age: "", gender: "" });
    setMedicalHistory({
      isNewlyPurchased: "",
      isVaccinated: "",
      previousOccurrences: "",
      contactWithSick: "",
      dietChange: ""
    });
    setInitialSymptoms("");
    setTemperature("");
    setPreviousTreatments("");
    setFollowupAnswers({});
    setDiagnosis(null);
    setSelectedImages([]);
    setExpandedDiff(null);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#1e293b] flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white px-8 py-4 border-b-2 border-[#3b82f6] flex justify-between items-center shadow-sm z-10">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-[#3b82f6] rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-md">V</div>
          <h1 className="text-xl font-bold text-[#0f172a]">فيتلي (Vetly) - مساعد التشخيص البيطري</h1>
        </div>
        <div className="flex items-center gap-4 text-sm font-medium">
          <span className="text-slate-600">د. حسام زين</span>
          <div className="w-8 h-8 bg-[#cbd5e1] rounded-full border-2 border-white shadow-sm overflow-hidden flex items-center justify-center">
             <Stethoscope className="w-4 h-4 text-white" />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="hidden lg:flex w-[280px] bg-white border-l border-[#e2e8f0] p-5 flex-col gap-4 shadow-[1px_0_10px_rgba(0,0,0,0.02)]">
          <h2 className="text-base font-bold mb-2 text-[#0f172a]">الحالات الأخيرة</h2>
          
          <div className="bg-white rounded-xl border border-[#e2e8f0] border-r-4 border-r-[#3b82f6] p-4 shadow-sm cursor-pointer hover:bg-slate-50 transition-colors">
            <div className="text-sm font-semibold mb-1">حالة: خيل عربي</div>
            <div className="text-xs text-[#64748b]">منذ 15 دقيقة • اشتباه مغص</div>
          </div>

          <div className="bg-white rounded-xl border border-[#e2e8f0] p-4 shadow-sm cursor-pointer hover:bg-slate-50 transition-colors opacity-80">
            <div className="text-sm font-semibold mb-1">حالة: قط منزلي</div>
            <div className="text-xs text-[#64748b]">أمس • عدوى تنفسية</div>
          </div>

          <div className="bg-white rounded-xl border border-[#e2e8f0] p-4 shadow-sm cursor-pointer hover:bg-slate-50 transition-colors opacity-80">
            <div className="text-sm font-semibold mb-1">حالة: بقرة هولشتاين</div>
            <div className="text-xs text-[#64748b]">12 أكتوبر • تورم جلدي</div>
          </div>

          {/* Sidebar Ad Placement */}
          <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-slate-50 to-blue-50 border border-blue-100/50 flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">إعلان ممول</span>
            </div>
            <div className="aspect-video bg-white rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden">
               <img 
                 src="https://picsum.photos/seed/vet/300/200" 
                 alt="Ad" 
                 className="w-full h-full object-cover opacity-80"
                 referrerPolicy="no-referrer"
               />
            </div>
            <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
              احصل على خصم 20% على معدات الفحص المتقدمة من شركائنا.
            </p>
            <button className="w-full text-[10px] font-bold py-1.5 rounded-md bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors">
              عرض المزيد
            </button>
          </div>

          <div className="mt-auto">
            <button 
              onClick={resetAll}
              className="w-full bg-[#3b82f6] hover:bg-blue-600 text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-100 flex items-center justify-center gap-2 transition-all"
            >
              <RefreshCcw className="w-4 h-4" />
              حالة جديدة
            </button>
          </div>
        </aside>

        {/* Content Section */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-5xl mx-auto space-y-8">
            {/* Catchy Hook Section */}
            <div className="relative overflow-hidden bg-gradient-to-r from-[#0f172a] to-[#1e293b] rounded-2xl p-8 mb-4 shadow-xl border border-white/5">
              <div className="relative z-10 md:flex items-center justify-between gap-8">
                <div className="flex-1 space-y-4">
                  <span className="inline-block px-3 py-1 bg-blue-500/20 border border-blue-500/30 rounded-full text-blue-400 text-[10px] font-bold uppercase tracking-wider">
                    مستقبل الطب البيطري بين يديك
                  </span>
                  <h2 className="text-2xl md:text-3xl font-black text-white leading-tight">
                    شخّص بذكاء، عالج بثقة، <br/>
                    وارتقِ بجودة رعايتك مع <span className="text-blue-400">فيتلي</span>
                  </h2>
                  <p className="text-slate-400 text-sm max-w-xl leading-relaxed">
                    منصة "فيتلي" المدعومة بأحدث تقنيات الذكاء الاصطناعي هي رفيقك السريري في العيادة والمزرعة، صُممت خصيصاً لمساعدتك في الوصول إلى أدق التشخيصات التفريقية في ثوانٍ.
                  </p>
                </div>
                <div className="hidden lg:block w-40 h-40 bg-blue-500/10 rounded-full blur-3xl absolute top-0 -right-10 animate-pulse"></div>
              </div>

              {/* Brief Usage Guide */}
              <div className="mt-8 pt-8 border-t border-white/10 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-xs shrink-0">١</div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-white">بيانات الحالة</h4>
                    <p className="text-[10px] text-slate-400">أدخل نوع الحيوان، الأعراض، وارفع الصور إن وجدت.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 border-r border-white/5 pr-4 md:pr-6">
                  <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-xs shrink-0">٢</div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-white">الاستنتاج الذكي</h4>
                    <p className="text-[10px] text-slate-400">أجب على الأسئلة السريرية التي يولدها النظام تلقائياً.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 border-r border-white/5 pr-4 md:pr-6">
                  <div className="w-6 h-6 rounded-full bg-blue-400 flex items-center justify-center text-white font-bold text-xs shrink-0">٣</div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-white">القرار الطبي</h4>
                    <p className="text-[10px] text-slate-400">احصل على التشخيص المحتمل، خطة العلاج، والمصادر العلمية.</p>
                  </div>
                </div>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {step === "info" && (
                <motion.div
                  key="info"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-xl border border-[#e2e8f0] shadow-sm p-6 md:p-8"
                >
                  <h3 className="text-base font-bold text-[#3b82f6] border-b border-[#f1f5f9] pb-4 mb-6">إدخال بيانات الحالة</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="space-y-1">
                      <label className="text-[13px] font-bold text-[#64748b]">نوع الحيوان</label>
                      <select 
                        className="w-full p-2.5 border border-[#cbd5e1] rounded-md bg-[#ffffff] focus:ring-2 focus:ring-blue-100 focus:border-[#3b82f6] outline-none transition-all text-sm"
                        value={animalInfo.type}
                        onChange={(e) => setAnimalInfo({...animalInfo, type: e.target.value})}
                      >
                        <option value="">اختر النوع...</option>
                        <option value="كلب">كلب</option>
                        <option value="قطط">قطط</option>
                        <option value="أبقار">أبقار</option>
                        <option value="جاموس">جاموس</option>
                        <option value="أغنام">أغنام</option>
                        <option value="خيول">خيول</option>
                        <option value="إبل">إبل</option>
                        <option value="دواجن">دواجن (دجاج، بط، رومي، إلخ)</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[13px] font-bold text-[#64748b]">العمر</label>
                      <input 
                        type="text"
                        placeholder="مثال: 4 سنوات"
                        className="w-full p-2.5 border border-[#cbd5e1] rounded-md focus:ring-2 focus:ring-blue-100 focus:border-[#3b82f6] outline-none transition-all text-sm"
                        value={animalInfo.age}
                        onChange={(e) => setAnimalInfo({...animalInfo, age: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[13px] font-bold text-[#64748b]">درجة الحرارة (C°)</label>
                      <input 
                        type="text"
                        placeholder="38.5"
                        className="w-full p-2.5 border border-[#cbd5e1] rounded-md focus:ring-2 focus:ring-blue-100 focus:border-[#3b82f6] outline-none transition-all text-sm"
                        value={temperature}
                        onChange={(e) => setTemperature(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[13px] font-bold text-[#64748b]">الجنس</label>
                      <select 
                        className="w-full p-2.5 border border-[#cbd5e1] rounded-md focus:ring-2 focus:ring-blue-100 focus:border-[#3b82f6] outline-none transition-all text-sm"
                        value={animalInfo.gender}
                        onChange={(e) => setAnimalInfo({...animalInfo, gender: e.target.value})}
                      >
                        <option value="">غير محدد</option>
                        <option value="ذكر">ذكر</option>
                        <option value="أنثى">أنثى</option>
                      </select>
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-8">
                    <h4 className="text-sm font-bold text-[#334155] mb-4 flex items-center gap-2">
                       <ClipboardList className="w-4 h-4 text-[#3b82f6]" /> التاريخ البيئي والمرضي للحالة
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-[#64748b]">هل مشتراة حديثاً؟</label>
                        <select 
                          className="w-full p-2 border border-[#cbd5e1] rounded-md bg-white text-xs outline-none"
                          value={medicalHistory.isNewlyPurchased}
                          onChange={(e) => setMedicalHistory({...medicalHistory, isNewlyPurchased: e.target.value})}
                        >
                          <option value="">اختر...</option>
                          <option value="نعم">نعم</option>
                          <option value="لا">لا</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-[#64748b]">هل هي محصنة؟</label>
                        <select 
                          className="w-full p-2 border border-[#cbd5e1] rounded-md bg-white text-xs outline-none"
                          value={medicalHistory.isVaccinated}
                          onChange={(e) => setMedicalHistory({...medicalHistory, isVaccinated: e.target.value})}
                        >
                          <option value="">اختر...</option>
                          <option value="محصنة بالكامل">محصنة بالكامل</option>
                          <option value="تحصين جزئي">تحصين جزئي</option>
                          <option value="غير محصنة">غير محصنة</option>
                          <option value="غير معروف">غير معروف</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-[#64748b]">هل تكررت الأعراض سابقاً؟</label>
                        <select 
                          className="w-full p-2 border border-[#cbd5e1] rounded-md bg-white text-xs outline-none"
                          value={medicalHistory.previousOccurrences}
                          onChange={(e) => setMedicalHistory({...medicalHistory, previousOccurrences: e.target.value})}
                        >
                          <option value="">اختر...</option>
                          <option value="أول مرة تظهر">أول مرة تظهر</option>
                          <option value="تكررت عدة مرات">تكررت عدة مرات</option>
                          <option value="كانت تظهر وتختفي">كانت تظهر وتختفي</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-[#64748b]">مخالطة حيوانات مريضة؟</label>
                        <select 
                          className="w-full p-2 border border-[#cbd5e1] rounded-md bg-white text-xs outline-none"
                          value={medicalHistory.contactWithSick}
                          onChange={(e) => setMedicalHistory({...medicalHistory, contactWithSick: e.target.value})}
                        >
                          <option value="">اختر...</option>
                          <option value="نعم، يوجد مخالطة">نعم، يوجد مخالطة</option>
                          <option value="لا يوجد مخالطة">لا يوجد مخالطة</option>
                          <option value="غير متأكد">غير متأكد</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-[#64748b]">تغيير في العلف/الغذاء؟</label>
                        <select 
                          className="w-full p-2 border border-[#cbd5e1] rounded-md bg-white text-xs outline-none"
                          value={medicalHistory.dietChange}
                          onChange={(e) => setMedicalHistory({...medicalHistory, dietChange: e.target.value})}
                        >
                          <option value="">اختر...</option>
                          <option value="نعم، تم التغيير حديثاً">نعم، تم التغيير حديثاً</option>
                          <option value="لا، الغذاء ثابت">لا، الغذاء ثابت</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1 mb-8">
                    <label className="text-[13px] font-bold text-[#64748b]">الأعراض الأولية</label>
                    <textarea 
                      rows={4}
                      placeholder="صف الحالة السريرية بتفصيل..."
                      className="w-full p-3 border border-[#cbd5e1] rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-[#3b82f6] outline-none transition-all text-sm resize-none"
                      value={initialSymptoms}
                      onChange={(e) => setInitialSymptoms(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1 mb-8">
                    <label className="text-[13px] font-bold text-[#64748b]">العلاجات السابقة والاستجابة (اختياري)</label>
                    <textarea 
                      rows={3}
                      placeholder="اذكر أي أدوية تم استخدامها ومدى استجابة الحالة لها للمساعدة في استبعاد بعض الأمراض..."
                      className="w-full p-3 border border-[#cbd5e1] rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-[#3b82f6] outline-none transition-all text-sm resize-none bg-slate-50"
                      value={previousTreatments}
                      onChange={(e) => setPreviousTreatments(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2 mb-8">
                    <label className="text-[13px] font-bold text-[#64748b] flex items-center gap-2">
                      <ImageIcon className="w-4 h-4" /> صور الحالة (اختياري)
                    </label>
                    <div className="flex flex-wrap gap-4">
                      {selectedImages.map((img, index) => (
                        <div key={index} className="relative group">
                          <img 
                            src={`data:${img.mimeType};base64,${img.base64}`} 
                            alt={`Preview ${index + 1}`} 
                            className="w-24 h-24 object-cover rounded-lg border-2 border-[#3b82f6]"
                          />
                          <button 
                            onClick={() => removeImage(index)}
                            className="absolute -top-2 -left-2 bg-red-500 text-white rounded-full p-1 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <CloseIcon className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      
                      <label className="cursor-pointer">
                        <div className="w-24 h-24 border-2 border-dashed border-[#cbd5e1] hover:border-[#3b82f6] rounded-xl flex flex-col items-center justify-center gap-1 transition-all group">
                          <Upload className="w-6 h-6 text-[#94a3b8] group-hover:text-[#3b82f6]" />
                          <p className="text-[10px] font-medium text-slate-500 group-hover:text-[#3b82f6]">إضافة صورة</p>
                          <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageChange} />
                        </div>
                      </label>
                    </div>
                  </div>

                  {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

                  <button 
                    onClick={handleInitialSubmit}
                    disabled={isLoading}
                    className="bg-[#3b82f6] hover:bg-blue-600 text-white font-bold py-3 px-8 rounded-lg shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isLoading ? <RefreshCcw className="w-5 h-5 animate-spin" /> : "معالجة الحالة واستخراج الأسئلة الذكية"}
                  </button>
                </motion.div>
              )}

              {step === "followup" && (
                <motion.div
                  key="followup"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white rounded-xl border border-[#e2e8f0] shadow-sm p-6 md:p-8"
                >
                  <h3 className="text-base font-bold text-[#3b82f6] border-b border-[#f1f5f9] pb-4 mb-6">أسئلة المتابعة الذكية</h3>
                  
                  <div className="bg-[#eff6ff] border border-dashed border-[#3b82f6] rounded-lg p-6 space-y-6">
                    {followupQuestions.map((q) => (
                      <div key={q.id} className="space-y-4">
                        <p className="text-sm font-bold text-[#1e40af]">{q.question}</p>
                        {q.type === "choice" ? (
                          <div className="flex flex-wrap gap-3">
                            {q.options?.map((opt) => (
                              <button
                                key={opt}
                                onClick={() => setFollowupAnswers({...followupAnswers, [q.id]: opt})}
                                className={`px-4 py-2 text-xs font-semibold rounded-md border transition-all ${
                                  followupAnswers[q.id] === opt 
                                  ? "bg-[#3b82f6] text-white border-[#3b82f6]" 
                                  : "bg-white text-slate-600 border-[#cbd5e1] hover:border-[#3b82f6]"
                                }`}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <input 
                            type="text"
                            placeholder="اكتب الإجابة..."
                            className="w-full p-2.5 bg-white border border-[#cbd5e1] rounded-md text-sm outline-none focus:border-[#3b82f6]"
                            onChange={(e) => setFollowupAnswers({...followupAnswers, [q.id]: e.target.value})}
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-4 mt-8">
                    <button onClick={() => setStep("info")} className="text-sm font-bold text-[#64748b] hover:text-slate-800 underline">رجوع</button>
                    <button 
                      onClick={generateFinalDiagnosis}
                      disabled={isLoading}
                      className="bg-[#3b82f6] hover:bg-blue-600 text-white font-bold py-3 px-8 rounded-lg shadow-md transition-all flex items-center justify-center gap-2 flex-grow max-w-xs disabled:opacity-50"
                    >
                      {isLoading ? <RefreshCcw className="w-5 h-5 animate-spin" /> : "عرض النتائج النهائية"}
                    </button>
                  </div>
                </motion.div>
              )}

              {step === "results" && diagnosis && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-xl border border-[#e2e8f0] shadow-sm p-6 md:p-8 space-y-6"
                  >
                    <h3 className="text-base font-bold text-[#059669] border-b border-[#f1f5f9] pb-4">النتائج والتشخيص المرجح</h3>
                    
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-lg">{diagnosis.mostLikely.name}</span>
                        <span className="px-3 py-1 bg-[#dcfce7] text-[#166534] text-xs font-bold rounded-full">احتمالية {diagnosis.mostLikely.probability}%</span>
                      </div>
                      <div className="w-full h-2 bg-[#f1f5f9] rounded-full overflow-hidden">
                        <motion.div 
                          className="h-full bg-[#059669]" 
                          initial={{ width: 0 }} 
                          animate={{ width: `${diagnosis.mostLikely.probability}%` }}
                        />
                      </div>
                      <div className="bg-[#f0fdf4] border border-[#dcfce7] rounded-lg p-5">
                        <p className="text-sm font-bold text-[#166534] mb-3">خطة العلاج المقترحة:</p>
                        <ul className="text-sm text-[#166534] space-y-2">
                          {diagnosis.mostLikely.treatmentPlan.map((p, i) => <li key={i} className="flex gap-2">• <span>{p}</span></li>)}
                        </ul>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                        <p className="text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">الفحوصات التأكيدية المطلوبة:</p>
                        <ul className="space-y-1">
                          {diagnosis.mostLikely.testsNeeded.map((t, i) => (
                            <li key={i} className="text-xs text-slate-700 flex items-center gap-2">
                              <div className="w-1 h-1 bg-[#3b82f6] rounded-full" /> {t}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between">
                        <div>
                          <p className="text-[11px] font-bold text-slate-500 mb-1 uppercase tracking-wider">المآل المتوقع (Prognosis):</p>
                          <p className="text-sm font-medium text-slate-700">{diagnosis.mostLikely.prognosis}</p>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between items-center">
                          <span className="text-[11px] font-bold text-slate-500">خطر العدوى للبشر:</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${diagnosis.mostLikely.isZoonotic ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                            {diagnosis.mostLikely.isZoonotic ? 'نعم (Zoonotic)' : 'لا يوجد'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="p-5 bg-blue-50 border border-blue-100 rounded-lg">
                      <p className="text-sm font-bold text-blue-800 mb-3 flex items-center gap-2">
                        <ClipboardList className="w-4 h-4" /> تعليمات الوقاية (لصاحب الحيوان):
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                        {diagnosis.mostLikely.preventionTips.map((tip, i) => (
                          <div key={i} className="text-xs text-blue-700 flex gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>{tip}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-6 border-t border-[#f1f5f9]">
                      <h4 className="text-[13px] font-bold text-[#64748b] mb-4">التشخيصات التفريقية الأخرى:</h4>
                      <div className="space-y-4">
                        {diagnosis.differentials.map((diff, i) => (
                          <div key={i} className="border border-[#f1f5f9] rounded-lg overflow-hidden transition-all">
                            <button 
                              onClick={() => setExpandedDiff(expandedDiff === i ? null : i)}
                              className="w-full flex items-center justify-between p-3 hover:bg-slate-50 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                {expandedDiff === i ? <ChevronUp className="w-4 h-4 text-[#3b82f6]" /> : <ChevronDown className="w-4 h-4 text-[#64748b]" />}
                                <span className="text-sm font-medium">{diff.name}</span>
                              </div>
                              <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full ${diff.probability > 40 ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#fef9c3] text-[#854d0e]'}`}>
                                {diff.probability}%
                              </span>
                            </button>
                            
                            <AnimatePresence>
                              {expandedDiff === i && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden bg-[#f8fafc] border-t border-[#f1f5f9]"
                                >
                                  <div className="p-4 space-y-3">
                                    <div>
                                      <p className="text-[11px] font-bold text-[#64748b] mb-1">الأعراض الجوهرية:</p>
                                      <p className="text-xs text-slate-600 leading-relaxed">{diff.keySymptoms}</p>
                                    </div>
                                    <div className="pt-2 border-t border-[#e2e8f0]">
                                      <p className="text-[11px] font-bold text-[#64748b] mb-1">خطة العلاج المختصرة:</p>
                                      <p className="text-xs text-slate-600 leading-relaxed">{diff.briefTreatment}</p>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-6"
                  >
                    <div className="bg-white rounded-xl border border-[#e2e8f0] shadow-sm p-6 space-y-4">
                      <h3 className="text-sm font-bold text-[#64748b] flex items-center gap-2">
                        <Info className="w-4 h-4" /> وصف إضافي للحالة المرجحة
                      </h3>
                      <p className="text-sm text-slate-600 leading-relaxed italic">{diagnosis.mostLikely.description}</p>
                    </div>

                    <div className="bg-[#fff7ed] border border-[#ffedd5] rounded-lg p-6 space-y-3">
                      <h3 className="text-[11px] font-black text-[#9a3412] uppercase tracking-wider flex items-center gap-2">
                        <ExternalLink className="w-3 h-3" /> المراجع العلمية
                      </h3>
                      <div className="flex flex-wrap gap-2 text-[11px] text-[#9a3412]">
                        {diagnosis.sources.map((s, i) => <span key={i} className="bg-white/50 px-2 py-1 rounded border border-[#ffedd5]"> {s} </span>)}
                      </div>
                    </div>

                    <div className="bg-[#fef2f2] border border-[#fee2e2] rounded-lg p-5 flex gap-3">
                      <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                      <p className="text-xs text-red-800 leading-relaxed font-medium">
                        {diagnosis.disclaimer}
                      </p>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="bg-[#f1f5f9] border-t border-[#e2e8f0] py-4 px-8 text-center space-y-4">
        {/* Horizontal Ad Placement */}
        <div className="max-w-4xl mx-auto p-4 bg-white rounded-xl border border-dashed border-slate-200 flex flex-col md:flex-row items-center gap-6">
          <div className="flex-1 text-right space-y-1">
            <h4 className="text-xs font-bold text-slate-800">لقاحات الدواجن المطورة - حماية قصوى لمزرعتك</h4>
            <p className="text-[11px] text-slate-500">متوفرة الآن لدى جميع الوكلاء المعتمدين في الشرق الأوسط.</p>
          </div>
          <div className="flex items-center gap-4 border-r md:pr-6 border-slate-100">
            <span className="text-[10px] font-black text-slate-300 uppercase">AD</span>
            <button className="px-5 py-2 bg-[#0f172a] text-white text-[11px] font-bold rounded-lg hover:opacity-90 transition-opacity">
              اطلب الآن
            </button>
          </div>
        </div>

        <p className="text-[12px] text-[#64748b] leading-relaxed">
          تنبيه: هذا النظام هو أداة مساعدة لاتخاذ القرار السريري ومخصص للأطباء البيطريين فقط. يجب أن يتم تنفيذ جميع خطط العلاج والتدخلات تحت الإشراف المباشر والمسؤولية الكاملة للطبيب البيطري المعالج وفقاً للقوانين المحلية.
        </p>
        <p className="text-[11px] font-bold text-slate-400">
          فيتلي (Vetly) &copy; {new Date().getFullYear()} - مساعدك الذكي في العيادة
        </p>
      </footer>
    </div>
  );
}
