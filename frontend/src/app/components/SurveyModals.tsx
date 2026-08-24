import { useState, useEffect, type MouseEvent } from "react";
import {
  Check, Link2, X, RefreshCw, AlertTriangle, Sparkles, Send, Plus, ChevronRight,
  Activity, CheckSquare, Zap, Users,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  changeSurveyLifecycle, generateSurveyQuestions, getSurveyQuota,
  updateSurveyQuestions, closeSurvey, sendSurvey, remindSurvey,
  type SurveyHealthContext, type SurveyQuota, type QuestionScore, type GeneratedSurveyQuestion,
} from "../api-survey";
import type { Project, Survey } from "../types";
import { fmtDate, hColor, scoreInt, SUBSCORE_LABELS } from "../format";

export function surveyIncidentLines(health: SurveyHealthContext): string[] {
  const incidents = health.incidents;
  if (!incidents) return [];
  const pct = (value: number) => Math.round(value <= 1 ? value * 100 : value);
  const lines: string[] = [];
  if (incidents.spilloverRatio != null) lines.push(`About ${pct(incidents.spilloverRatio)}% of committed sprint work spilled over`);
  if (incidents.midSprintAdditions != null && incidents.midSprintAdditions > 0) lines.push(`${incidents.midSprintAdditions} tickets added after the sprint started`);
  if (incidents.blockedItemsCount != null && incidents.blockedItemsCount > 0) lines.push(`${incidents.blockedItemsCount} tickets currently blocked`);
  if (incidents.overdueItemsCount != null && incidents.overdueItemsCount > 0) lines.push(`${incidents.overdueItemsCount} overdue tickets`);
  if (incidents.stalePrCount != null && incidents.stalePrCount > 0) lines.push(`${incidents.stalePrCount} stale pull requests`);
  if (incidents.prCycleTimeHours != null) lines.push(`Average time to first PR review is about ${Math.round(incidents.prCycleTimeHours)} hours`);
  if (incidents.deploymentsPerWeek != null) lines.push(`${incidents.deploymentsPerWeek} deployments in the last week`);
  if (incidents.deploymentFailureRatePercent != null && incidents.deploymentFailureRatePercent > 0) {
    lines.push(`About ${pct(incidents.deploymentFailureRatePercent)}% of recent deployments failed`);
  }
  return lines;
}

export function CloseSurveyFormButton({surveyId,onClosed,mode}:{surveyId:string;onClosed?:()=>void;mode?:"close"|"score";}) {
  const [busy,setBusy]=useState(false);
  const closeForm=async(event:MouseEvent)=>{
    event.stopPropagation();
    setBusy(true);
    try{
      await closeSurvey(Number(surveyId));
      onClosed?.();
    }catch(error){
      window.alert(error instanceof Error?error.message:"Failed to close survey");
    }finally{
      setBusy(false);
    }
  };
  const idleLabel=mode==="score"?"Retry scoring":"Close form";
  return (
    <button type="button" disabled={busy} onClick={event=>{void closeForm(event);}}
      className="shrink-0 whitespace-nowrap text-xs font-semibold border border-amber-500/50 text-amber-700 dark:text-amber-400 px-2 py-1 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50">
      {busy?"Closing…":idleLabel}
    </button>
  );
}

export function CopySurveyLinkButton({url}:{url:string}) {
  const [copied,setCopied]=useState(false);
  const copy=async(event:MouseEvent)=>{
    event.stopPropagation();
    try{
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(()=>setCopied(false),1600);
    }catch{
      window.alert("Could not copy the survey link");
    }
  };
  return (
    <button type="button" title={copied?"Copied":"Copy survey link"} onClick={event=>{void copy(event);}}
      className="shrink-0 border border-border px-1.5 py-1 text-muted-foreground hover:text-primary hover:border-primary">
      {copied?<Check size={13}/>:<Link2 size={13}/>}
    </button>
  );
}

export function RemindSurveyButton({surveyId,onDone}:{surveyId:string;onDone?:()=>void;}) {
  const [busy,setBusy]=useState(false);
  const remind=async(event:MouseEvent)=>{
    event.stopPropagation();
    setBusy(true);
    try{
      await remindSurvey(Number(surveyId));
      onDone?.();
    }catch(error){
      window.alert(error instanceof Error?error.message:"Failed to send reminder");
    }finally{
      setBusy(false);
    }
  };
  return (
    <button type="button" disabled={busy} title="Post an anonymous reminder to team channels" onClick={event=>{void remind(event);}}
      className="shrink-0 whitespace-nowrap text-xs font-semibold border border-border px-2 py-1 text-foreground hover:border-primary hover:text-primary disabled:opacity-50">
      {busy?"Sending…":"Remind"}
    </button>
  );
}

export function SurveyAskedQuestions({questions}:{questions?:GeneratedSurveyQuestion[]}) {
  if (!questions?.length) return null;
  return (
    <div className="mb-4">
      <div className="text-sm font-bold text-muted-foreground mb-3">Questions asked</div>
      <div className="border border-border divide-y divide-border">
        {questions.map((q,i)=>(
          <div key={`${q.questionText}-${i}`} className="flex gap-3 px-4 py-3 items-start">
            <span className="shrink-0 w-5 h-5 flex items-center justify-center bg-muted text-xs font-bold mt-0.5">{i+1}</span>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-foreground">{q.questionText}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{q.category} · {q.questionType==="scale"?"Scale 1–5":"Text"}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SurveyCategoryScores({scores}:{scores:NonNullable<Survey["scores"]>}) {
  const keys = ["delivery","codeQuality","cicd","teamHealth","blockers"] as const;
  return (
    <div className="grid grid-cols-5 gap-2 mb-4">
      {keys.map((k)=>(
        <div key={k} className="border border-border px-2 py-2 text-center">
          <div className="text-[10px] font-semibold text-muted-foreground mb-1 leading-tight">{SUBSCORE_LABELS[k]}</div>
          <div className="text-lg font-bold tabular-nums" style={{fontFamily:"var(--font-mono)",color:hColor(scores[k])}}>{scoreInt(scores[k])}</div>
        </div>
      ))}
    </div>
  );
}

const DEFAULT_QUESTIONS=[
  "What is your biggest blocker or obstacle this sprint?",
  "How confident are you in the team's ability to meet this sprint's goals? (1–5)",
  "How clear and consistent is communication from product and leadership?",
  "Are there any cross-team dependencies slowing you down?",
  "What would most improve your team's velocity in the next two weeks?",
];

interface EditableQuestion {
  id:string;
  text:string;
  category?:string;
  questionType:"text"|"scale";
  score?:QuestionScore;
}

export function ReviewScheduledSurveyModal({survey,onClose,onChanged}:{
  survey:Survey;onClose:()=>void;onChanged?:()=>void;
}) {
  const [questions,setQuestions]=useState<EditableQuestion[]>(
    (survey.questions??[]).map((question,index)=>({
      id:String(index),
      text:question.questionText,
      category:question.category,
      questionType:question.questionType,
    })),
  );
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const surveyId=Number(survey.id);
  const canEdit=!survey.questionsLocked&&survey.status!=="cancelled";

  const persist=async()=>{
    if(!canEdit) return;
    const payload=questions.filter(q=>q.text.trim()).map(q=>({
      category:q.category||"delivery",questionText:q.text.trim(),questionType:q.questionType,
    }));
    if(payload.length===0) return;
    await updateSurveyQuestions(surveyId,payload);
  };

  const save=async()=>{
    setSaving(true);setError(null);
    try{
      await persist();
      onChanged?.();onClose();
    }catch(err){setError(err instanceof Error?err.message:"Failed to save questions");}
    finally{setSaving(false);}
  };
  const closeReview=async()=>{
    try{if(canEdit) await persist();}catch{/* still close */}
    onChanged?.();
    onClose();
  };
  const transition=async(action:"pause"|"resume"|"retry"|"cancel")=>{
    setSaving(true);setError(null);
    try{await changeSurveyLifecycle(surveyId,action);onChanged?.();onClose();}
    catch(err){setError(err instanceof Error?err.message:`Failed to ${action} survey`);}
    finally{setSaving(false);}
  };
  const health=survey.healthContext;

  return (
    <motion.div role="dialog" aria-modal="true" aria-labelledby="review-survey-title" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={()=>{void closeReview();}}>
      <motion.div initial={{scale:0.97,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.97,opacity:0}}
        onClick={event=>event.stopPropagation()} className="w-full max-w-2xl max-h-[88vh] flex flex-col bg-card border border-border shadow-2xl">
        <div className="flex items-start justify-between px-6 py-5 border-b border-border">
          <div>
            <h2 id="review-survey-title" className="text-xl font-bold" style={{fontFamily:"var(--font-display)"}}>Review Scheduled Survey</h2>
            <p className="text-sm text-muted-foreground mt-1">Auto-sends {fmtDate(survey.reviewDeadlineAt||survey.scheduledSendAt||"")} unless paused.</p>
          </div>
          <button aria-label="Close review" onClick={()=>{void closeReview();}} className="text-muted-foreground hover:text-foreground"><X size={18}/></button>
        </div>
        <div className="overflow-y-auto p-6 space-y-5">
          {health&&(
            <div className="border border-border bg-muted/30 p-4">
              <div className="text-sm font-bold mb-1">AI health context</div>
              <p className="text-sm text-muted-foreground">
                Captured {fmtDate(health.capturedAt)} · Overall {health.overallScore==null?"unavailable":Math.round(health.overallScore)}
                {health.trendDelta==null?"":` · Trend ${health.trendDelta>0?"+":""}${health.trendDelta.toFixed(1)}`}
              </p>
              {surveyIncidentLines(health).length>0&&(
                <ul className="mt-3 space-y-1 text-sm text-foreground">
                  {surveyIncidentLines(health).map(line=><li key={line}>· {line}</li>)}
                </ul>
              )}
              <p className="text-xs text-muted-foreground mt-2">Gemini uses this snapshot and these incidents to focus questions, but scores responses independently.</p>
            </div>
          )}
          {error&&<div className="border border-red-400/50 bg-red-50 dark:bg-red-950/20 p-3 text-sm text-red-600">{error}</div>}
          <div className="space-y-3">
            {questions.map((question,index)=>(
              <div key={question.id} className="border border-border p-3">
                <div className="flex gap-2 mb-2">
                  <select aria-label={`Category for question ${index+1}`} disabled={!canEdit} value={question.category||"delivery"}
                    onChange={e=>setQuestions(current=>current.map(q=>q.id===question.id?{...q,category:e.target.value}:q))}
                    className="bg-card border border-border px-2 py-1.5 text-sm">
                    {["delivery","codeQuality","cicd","teamHealth","blockers"].map(category=><option key={category} value={category}>{category}</option>)}
                  </select>
                  <select aria-label={`Type for question ${index+1}`} disabled={!canEdit} value={question.questionType}
                    onChange={e=>setQuestions(current=>current.map(q=>q.id===question.id?{...q,questionType:e.target.value as "text"|"scale"}:q))}
                    className="bg-card border border-border px-2 py-1.5 text-sm">
                    <option value="text">Text</option><option value="scale">Scale 1–5</option>
                  </select>
                </div>
                <textarea aria-label={`Question ${index+1}`} disabled={!canEdit} rows={2} value={question.text}
                  onChange={e=>setQuestions(current=>current.map(q=>q.id===question.id?{...q,text:e.target.value}:q))}
                  className="w-full bg-card border border-border px-3 py-2 text-sm resize-none disabled:opacity-60"/>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-border p-4 flex items-center justify-between gap-3">
          <div className="flex gap-2">
            {survey.status==="failed"
              ?<button disabled={saving} onClick={()=>void transition("retry")} className="border border-border px-3 py-2 text-sm font-semibold">{survey.questionsLocked?"Retry analysis":"Retry delivery"}</button>
              :survey.status==="paused"
              ?<button disabled={saving} onClick={()=>void transition("resume")} className="border border-border px-3 py-2 text-sm font-semibold">Resume</button>
              :<button disabled={saving||!canEdit} onClick={()=>void transition("pause")} className="border border-border px-3 py-2 text-sm font-semibold">Pause</button>}
            <button disabled={saving||!canEdit} onClick={()=>void transition("cancel")} className="border border-red-400/50 text-red-600 px-3 py-2 text-sm font-semibold">Cancel</button>
          </div>
          <button disabled={saving||!canEdit||questions.every(q=>!q.text.trim())} onClick={()=>void save()}
            className="bg-primary text-primary-foreground px-5 py-2 text-sm font-semibold disabled:opacity-40">{saving?"Saving…":"Save questions"}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function SendSurveyModal({onClose,project,customGuidance,onSent,audienceSize,demoOnly,draftSurvey}:{onClose:()=>void;project:Project;customGuidance?:string;onSent?:()=>void;audienceSize?:number;demoOnly?:boolean;draftSurvey?:Survey|null;}) {
  const backendProjectId=project.backendProjectId;
  const isReal=Boolean(backendProjectId);
  const hasDraft=Boolean(draftSurvey&&(draftSurvey.questions?.length??0)>0);

  const [surveyId,setSurveyId]=useState<number|null>(hasDraft?Number(draftSurvey!.id):null);
  const [scheduledSendAt,setScheduledSendAt]=useState<string|null>(draftSurvey?.scheduledSendAt??draftSurvey?.reviewDeadlineAt??null);
  const [trigger,setTrigger]=useState(draftSurvey?.trigger||"Manual team pulse check");
  const [questions,setQuestions]=useState<EditableQuestion[]>(
    hasDraft
      ?(draftSurvey!.questions??[]).map((q,i)=>({id:`q${i}`,text:q.questionText,category:q.category,questionType:q.questionType}))
      :isReal?[]:DEFAULT_QUESTIONS.map((q,i)=>({id:`q${i}`,text:q,questionType:"text"})),
  );
  const [step,setStep]=useState<"generating"|"edit"|"preview"|"sending"|"sent"|"error">(isReal&&!hasDraft?"generating":"edit");
  const [errorMessage,setErrorMessage]=useState<string|null>(null);
  const [quota,setQuota]=useState<SurveyQuota|null>(null);
  const [sentResult,setSentResult]=useState<{queued?:boolean;questionCount?:number;url?:string;expiresAt?:string;delivery?:{slackSent?:boolean;telegramSent?:boolean;discordSent?:boolean}}|null>(null);

  const questionPayload=()=>questions.filter(q=>q.text.trim()).map(q=>({
    category:q.category||"delivery",
    questionText:q.text.trim(),
    questionType:q.questionType,
  }));

  const persistEdits=async()=>{
    if(!surveyId||questionPayload().length===0) return;
    await updateSurveyQuestions(surveyId,questionPayload());
  };

  const closeModal=async()=>{
    try{
      if(surveyId&&(step==="edit"||step==="preview")) await persistEdits();
    }catch{
      // Closing should still dismiss the window; edits can be retried from history.
    }
    onSent?.();
    onClose();
  };

  const generate=async(force=false)=>{
    if(!backendProjectId) return;
    setStep("generating");
    setErrorMessage(null);
    try{
      const [generated,q]=await Promise.all([
        generateSurveyQuestions(backendProjectId,trigger,customGuidance,undefined,force),
        getSurveyQuota(backendProjectId),
      ]);
      setSurveyId(generated.surveyId);
      setScheduledSendAt(generated.scheduledSendAt);
      setQuestions(generated.questions.map((s,i)=>({id:`q${i}`,text:s.questionText,category:s.category,questionType:s.questionType,score:s.score})));
      setQuota(q);
      onSent?.();
      setStep("edit");
    }catch(err){
      setErrorMessage(err instanceof Error?err.message:"Failed to generate questions");
      setStep("error");
    }
  };

  const sendReviewed=async()=>{
    if(!backendProjectId) return;
    setStep("sending");
    setErrorMessage(null);
    try{
      const payload=questionPayload();
      await sendSurvey(backendProjectId,trigger,customGuidance,payload,undefined,undefined,surveyId??undefined);
      setSentResult({queued:true,questionCount:payload.length});
      onSent?.();
      setStep("sent");
    }catch(err){
      setErrorMessage(err instanceof Error?err.message:"Failed to send survey");
      setStep("error");
    }
  };
  useEffect(()=>{
    if(!isReal||!backendProjectId) return;
    if(hasDraft){
      void getSurveyQuota(backendProjectId).then(setQuota).catch(()=>{});
      return;
    }
    void generate();
  },[]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateQ=(id:string,val:string)=>setQuestions(prev=>prev.map(q=>q.id===id?{...q,text:val}:q));
  const removeQ=(id:string)=>setQuestions(prev=>prev.filter(q=>q.id!==id));
  const addQ=()=>setQuestions(prev=>[...prev,{id:`q${Date.now()}`,text:"",questionType:"text"}]);

  const send=async()=>{
    if(demoOnly){
      try{
        if(surveyId) await persistEdits();
        onSent?.();
        setStep("sent");
      }catch(err){
        setErrorMessage(err instanceof Error?err.message:"Failed to save questions");
        setStep("error");
      }
      return;
    }
    if(!isReal||!backendProjectId){setStep("sent");return;}
    await sendReviewed();
  };

  const remaining=quota?quota.remaining:1;

  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={()=>{void closeModal();}}>
      <motion.div initial={{scale:0.97,y:8,opacity:0}} animate={{scale:1,y:0,opacity:1}} exit={{scale:0.97,y:8,opacity:0}} transition={{duration:0.16}}
        onClick={e=>e.stopPropagation()} className="w-full max-w-2xl bg-card border border-border shadow-2xl flex flex-col max-h-[88vh]">

        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <div className="text-xl font-bold" style={{fontFamily:"var(--font-display)"}}>
              {step==="generating"?"Generating Questions":step==="edit"?(demoOnly?"Review generated questions":"Review & Edit Survey"):step==="preview"?"Survey Preview":step==="sending"?"Sending Survey…":step==="error"?"Something Went Wrong":demoOnly?"Generation test complete":"Survey Sent"}
            </div>
            <div className="text-sm text-muted-foreground mt-0.5">
              {project.name}
              {scheduledSendAt&&step!=="sent"?` · Auto-sends ${fmtDate(scheduledSendAt)} unless you send now`:""}
            </div>
          </div>
          <button onClick={()=>{void closeModal();}} className="text-muted-foreground hover:text-foreground transition-colors"><X size={18}/></button>
        </div>

        {step==="generating"||step==="sending"?(
          <div className="flex-1 flex flex-col items-center justify-center gap-3 p-10">
            <RefreshCw size={24} className="animate-spin text-primary"/>
            <div className="text-base text-muted-foreground text-center max-w-sm">{step==="generating"?"AI is drafting and scoring questions for this survey…":"Queuing delivery of your reviewed questions…"}</div>
          </div>
        ):step==="error"?(
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-10">
            <AlertTriangle size={28} className="text-red-500"/>
            <div className="text-base text-foreground text-center max-w-sm">{errorMessage}</div>
            <button onClick={()=>{if(isReal) void generate(true); else setStep("edit");}} className="bg-primary text-primary-foreground px-6 py-2.5 text-base font-semibold hover:opacity-90 transition-opacity" style={{fontFamily:"var(--font-display)"}}>Try again</button>
          </div>
        ):step==="sent"?(
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-10">
            <div className="w-14 h-14 bg-emerald-500 flex items-center justify-center"><Check size={26} className="text-white"/></div>
            <div className="text-2xl font-bold text-center" style={{fontFamily:"var(--font-display)"}}>{demoOnly?"Draft saved — nothing sent":isReal?"Survey queued":"Survey sent successfully"}</div>
            <div className="text-base text-muted-foreground text-center max-w-md">
              {demoOnly
                ? `${questions.filter(q=>q.text.trim()).length} questions stored. You can keep editing until ${scheduledSendAt?fmtDate(scheduledSendAt):"the auto-send window"}, or use Send Survey Now to broadcast now.`
                : isReal
                ? `${sentResult?.questionCount??questions.length} reviewed questions will be posted to team channels in the background. Watch Survey History for Active status.`
                :`Sent to ${project.name} team · ${questions.length} questions · responses due in 48h`}
            </div>
            <button onClick={()=>{void closeModal();}} className="mt-2 bg-primary text-primary-foreground px-8 py-2.5 text-base font-semibold hover:opacity-90 transition-opacity" style={{fontFamily:"var(--font-display)"}}>Done</button>
          </div>
        ):step==="preview"?(
          <div className="flex-1 overflow-y-auto">
            {/* Preview banner */}
            <div className="bg-muted px-6 py-3 border-b border-border flex items-center justify-between">
              <span className="text-sm font-semibold text-muted-foreground">Preview — how recipients will see this survey</span>
              <button onClick={()=>setStep("edit")} className="text-sm text-primary font-semibold hover:opacity-75">← Edit questions</button>
            </div>
            <div className="px-8 py-8 space-y-6">
              <div>
                <div className="text-2xl font-bold mb-1" style={{fontFamily:"var(--font-display)"}}>Team Pulse — {project.name}</div>
                <div className="text-sm text-muted-foreground">{questions.length} questions · ~3 minutes · Anonymous</div>
              </div>
              {questions.filter(q=>q.text.trim()).map((q,i)=>(
                <div key={q.id} className="border border-border bg-muted/20 p-5">
                  <div className="text-sm font-bold text-muted-foreground mb-2">Q{i+1}</div>
                  <div className="text-[15px] font-semibold text-foreground">{q.text}</div>
                  {q.questionType==="scale"?(
                    <div className="flex gap-2 mt-3">{[1,2,3,4,5].map(n=>(
                      <div key={n} className="w-10 h-10 border-2 border-border flex items-center justify-center text-sm font-bold text-muted-foreground" style={{fontFamily:"var(--font-mono)"}}>{n}</div>
                    ))}</div>
                  ):(
                    <div className="mt-3 h-16 border border-border bg-background/50"/>
                  )}
                </div>
              ))}
            </div>
          </div>
        ):(
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {errorMessage&&(
              <div className="flex items-start gap-3 px-4 py-3.5 border border-red-400/50 bg-red-50 dark:bg-red-950/20">
                <AlertTriangle size={16} className="shrink-0 mt-0.5 text-red-500"/>
                <div className="text-sm font-semibold text-foreground">{errorMessage}</div>
              </div>
            )}

            {/* Trigger */}
            {isReal&&(
              <div>
                <label className="text-sm font-semibold text-foreground mb-1 block" style={{fontFamily:"var(--font-display)"}}>Reason for sending</label>
                <div className="flex items-center gap-2">
                  <input value={trigger} onChange={e=>setTrigger(e.target.value)} placeholder="e.g. Sprint retro follow-up"
                    className="flex-1 bg-card border border-border px-3 py-2 text-[14px] outline-none focus:border-primary transition-colors"/>
                  <button onClick={()=>{void generate(true);}} className="shrink-0 flex items-center gap-1.5 text-sm font-semibold text-primary hover:opacity-75 transition-opacity px-2">
                    <RefreshCw size={13}/> Regenerate
                  </button>
                </div>
              </div>
            )}

            {/* Quota warning */}
            {demoOnly?(
              <div className="flex items-start gap-3 px-4 py-3.5 border border-border bg-muted/30">
                <Sparkles size={16} className="shrink-0 mt-0.5 text-primary"/>
                <div className="text-sm text-muted-foreground">
                  Questions are saved as a draft{scheduledSendAt?` and auto-send ${fmtDate(scheduledSendAt)}`:""}. Edit until this window closes, then use Send Survey Now if you want to broadcast immediately.
                </div>
              </div>
            ):quota&&(
              <div className={`flex items-start gap-3 px-4 py-3.5 border ${remaining<=1?"border-amber-400/50 bg-amber-50 dark:bg-amber-950/20":"border-border bg-muted/30"}`}>
                <AlertTriangle size={16} className={`shrink-0 mt-0.5 ${remaining<=1?"text-amber-500":"text-muted-foreground"}`}/>
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    Sending this uses 1 of your {remaining} remaining survey{remaining!==1?"s":""} this month
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    Quota: {quota.used} used / {quota.limit} per month
                    {audienceSize?` · Settings team is ${audienceSize}. Response rate uses developers in projectmember.`:""}
                  </div>
                </div>
              </div>
            )}

            {/* Questions */}
            <div className="text-sm font-semibold text-foreground mb-1" style={{fontFamily:"var(--font-display)"}}>Questions ({questions.length})</div>
            <div className="space-y-2">
              {questions.map((q,i)=>(
                <div key={q.id} className="flex items-start gap-3 bg-muted/30 border border-border p-3">
                  <span className="shrink-0 w-6 h-6 flex items-center justify-center bg-primary text-primary-foreground text-xs font-bold mt-1">{i+1}</span>
                  <div className="flex-1 space-y-1.5">
                    {q.category&&(
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase text-muted-foreground tracking-wide">{q.category}</span>
                        <select aria-label={`Type for question ${i+1}`} value={q.questionType}
                          onChange={e=>setQuestions(prev=>prev.map(item=>item.id===q.id?{...item,questionType:e.target.value as "text"|"scale"}:item))}
                          className="text-xs bg-card border border-border px-1.5 py-1">
                          <option value="text">Text</option><option value="scale">Scale 1–5</option>
                        </select>
                        {q.score&&q.score.overall>0&&<span className="text-xs font-semibold text-primary" title="AI quality score">score {Math.round(q.score.overall)}</span>}
                      </div>
                    )}
                    <textarea value={q.text} rows={2} onChange={e=>updateQ(q.id,e.target.value)} placeholder="Enter question…"
                      className="w-full bg-card border border-border px-3 py-2 text-[14px] outline-none focus:border-primary resize-none transition-colors"/>
                  </div>
                  <button onClick={()=>removeQ(q.id)} className="text-muted-foreground hover:text-red-500 transition-colors mt-1 shrink-0"><X size={14}/></button>
                </div>
              ))}
              <button onClick={addQ} className="flex items-center gap-1.5 text-sm text-primary font-semibold hover:opacity-75 transition-opacity mt-1">
                <Plus size={13}/> Add question
              </button>
            </div>
          </div>
        )}

        {(step==="edit"||step==="preview")&&(
          <div className="px-6 py-4 border-t border-border flex items-center justify-between">
            {step==="edit"?(
              <>
                <button onClick={()=>setStep("preview")} className="text-[15px] font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
                  <ChevronRight size={14}/> Preview
                </button>
                <button onClick={send} disabled={questions.filter(q=>q.text.trim()).length===0}
                  className="flex items-center gap-2 bg-primary text-primary-foreground text-base font-semibold px-6 py-2.5 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{fontFamily:"var(--font-display)"}}>
                  {demoOnly?<><Sparkles size={14}/> Save draft</>:<><Send size={14}/> Send to Team</>}
                </button>
              </>
            ):(
              <>
                <button onClick={()=>setStep("edit")} className="text-[15px] text-muted-foreground hover:text-foreground transition-colors">← Edit</button>
                <button onClick={send}
                  className="flex items-center gap-2 bg-primary text-primary-foreground text-base font-semibold px-6 py-2.5 hover:opacity-90 transition-opacity"
                  style={{fontFamily:"var(--font-display)"}}>
                  {demoOnly?<><Sparkles size={14}/> Save draft</>:<><Send size={14}/> Confirm &amp; Send</>}
                </button>
              </>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

const RUBRIC_ROWS=[
  {cat:"Delivery",icon:<Activity size={14}/>,color:"text-blue-600 dark:text-blue-400",what:"Sprint velocity, ticket closure rate, story point completion",how:"Survey sentiment + metric trend (velocity, tickets closed)"},
  {cat:"Code Quality",icon:<CheckSquare size={14}/>,color:"text-emerald-600 dark:text-emerald-400",what:"Bug counts, PR quality, test coverage, tech debt perception",how:"Blocker count + PR cycle time + team feedback"},
  {cat:"CI/CD",icon:<Zap size={14}/>,color:"text-violet-600 dark:text-violet-400",what:"Build reliability, deployment frequency, pipeline failures",how:"Deployment frequency metric + survey confidence scores"},
  {cat:"Team Health",icon:<Users size={14}/>,color:"text-amber-600 dark:text-amber-400",what:"Morale, communication quality, work-life balance, psychological safety",how:"Survey-only: aggregated from team responses on wellbeing"},
  {cat:"Blockers",icon:<AlertTriangle size={14}/>,color:"text-red-600 dark:text-red-400",what:"Open blockers, cross-team dependencies, unresolved waiting items",how:"Open blockers metric + survey answers on impediments"},
];

export function SurveyRubricPanel({onClose}:{onClose:()=>void}) {
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{scale:0.97,y:8,opacity:0}} animate={{scale:1,y:0,opacity:1}} exit={{scale:0.97,y:8,opacity:0}} transition={{duration:0.16}}
        onClick={e=>e.stopPropagation()} className="w-full max-w-3xl bg-card border border-border shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <div className="text-xl font-bold" style={{fontFamily:"var(--font-display)"}}>Survey Scoring Rubric</div>
            <div className="text-sm text-muted-foreground mt-0.5">How each category is evaluated — scores range 0–100</div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors"><X size={18}/></button>
        </div>
        <div className="p-6">
          <div className="border border-border divide-y divide-border">
            <div className="grid grid-cols-[140px_1fr_1fr] gap-0 px-4 py-3 bg-muted">
              {["Category","What we measure","How it's scored"].map(h=>(
                <div key={h} className="text-sm font-bold text-foreground" style={{fontFamily:"var(--font-display)"}}>{h}</div>
              ))}
            </div>
            {RUBRIC_ROWS.map(r=>(
              <div key={r.cat} className="grid grid-cols-[140px_1fr_1fr] gap-0 px-4 py-4 items-start hover:bg-muted/30 transition-colors">
                <div className={`flex items-center gap-2 font-semibold text-[15px] ${r.color}`}>
                  {r.icon}{r.cat}
                </div>
                <div className="text-[14px] text-foreground leading-relaxed pr-4">{r.what}</div>
                <div className="text-[14px] text-muted-foreground leading-relaxed">{r.how}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 bg-muted/40 border border-border px-5 py-4">
            <div className="text-sm font-bold text-foreground mb-2">Scoring method</div>
            <div className="text-[14px] text-muted-foreground leading-relaxed">
              Each category score is calculated from a weighted combination of metric data (60%) and survey response sentiment (40%).
              The overall health score is a weighted average of all five category scores:
              Delivery 25% · Code Quality 20% · CI/CD 20% · Team Health 20% · Blockers 15%.
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
