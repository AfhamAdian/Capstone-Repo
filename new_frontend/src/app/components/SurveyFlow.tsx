import { useState } from "react";
import { X, Check, ArrowRight, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { submitPublicSurveyResponse, type PublicSurveyForm } from "../api-survey";

interface FlowQuestion{id?:number;q:string;t:"text"|"scale";projectName?:string;}

const DEMO_SURVEY_QUESTIONS:FlowQuestion[]=[
  {q:"What is your biggest blocker this sprint?",t:"text"},
  {q:"How confident are you in this sprint's outcome?",t:"scale"},
  {q:"What would improve team effectiveness most?",t:"text"},
  {q:"How is cross-team communication working?",t:"text"},
];

/**
 * Used two ways: (1) as an in-app "preview" demo (no `form`/`token` - local-only,
 * hardcoded questions, nothing submitted), and (2) as the real anonymous
 * respondent flow at /survey/:token (PublicSurveyPage passes `form` + `token`
 * + `standalone`, answers are actually submitted to the backend).
 */
export function SurveyFlow({onClose,form,token,standalone}:{onClose:()=>void;form?:PublicSurveyForm;token?:string;standalone?:boolean;}) {
  const qs:FlowQuestion[]=form
    ?form.projects.flatMap(p=>p.questions.map(q=>({id:q.id,q:q.text,t:q.type,projectName:p.projectName})))
    :DEMO_SURVEY_QUESTIONS;
  const [step,setStep]=useState(0), [ans,setAns]=useState<(string|number|null)[]>(qs.map(()=>null)), [done,setDone]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const [submitError,setSubmitError]=useState<string|null>(null);
  const cur=qs[step];

  const finish=async()=>{
    if(form&&token){
      setSubmitting(true);
      setSubmitError(null);
      try{
        const answers=qs.map((q,i)=>{
          const a=ans[i];
          if(a==null||a==="") return null;
          return q.t==="scale"?{questionId:q.id!,answerScale:a as number}:{questionId:q.id!,answerText:a as string};
        }).filter((a):a is NonNullable<typeof a>=>a!==null);
        if(answers.length===0){setSubmitError("Please answer at least one question.");setSubmitting(false);return;}
        await submitPublicSurveyResponse(token,answers);
        setDone(true);
      }catch(err){
        setSubmitError(err instanceof Error?err.message:"Failed to submit your response");
      }finally{
        setSubmitting(false);
      }
    }else{
      setDone(true);
    }
  };
  const next=()=>step<qs.length-1?setStep(step+1):void finish();

  if(qs.length===0){
    return (
      <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-background z-50 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <AlertTriangle size={28} className="text-amber-500 mx-auto mb-4"/>
          <p className="text-base text-muted-foreground">This survey has no questions to answer.</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-background z-50 flex items-center justify-center">
      {!standalone&&<button onClick={onClose} className="absolute top-6 right-6 text-muted-foreground hover:text-foreground"><X size={20}/></button>}
      <div className="w-full max-w-lg px-6">
        <div className="mb-10">
          <div className="flex items-center justify-between text-base text-muted-foreground mb-3" style={{fontFamily:"var(--font-mono)"}}><span>{done?"Complete":`${step+1} / ${qs.length}`}</span><span>~2 minutes</span></div>
          <div className="h-1 bg-muted"><motion.div className="h-full bg-primary" animate={{width:`${done?100:(step/qs.length)*100}%`}} transition={{duration:0.3}}/></div>
        </div>
        <AnimatePresence mode="wait">
          {done?(
            <motion.div key="done" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} className="text-center">
              <div className="w-16 h-16 bg-primary flex items-center justify-center mx-auto mb-6"><Check size={28} className="text-primary-foreground"/></div>
              <h2 className="text-4xl font-bold uppercase mb-3" style={{fontFamily:"var(--font-display)"}}>Thank you</h2>
              <p className="text-base text-muted-foreground">Your responses are recorded anonymously.</p>
              {standalone
                ?<p className="text-sm text-muted-foreground mt-6">You can close this tab now.</p>
                :<button onClick={onClose} className="mt-8 bg-primary text-primary-foreground px-10 py-3 text-base font-semibold hover:opacity-90 transition-opacity" style={{fontFamily:"var(--font-display)"}}>Close</button>}
            </motion.div>
          ):(
            <motion.div key={step} initial={{opacity:0,x:24}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-24}} transition={{duration:0.2}}>
              {cur.projectName&&<div className="text-xs font-bold uppercase tracking-wide text-primary mb-2">{cur.projectName}</div>}
              <h2 className="text-2xl font-bold text-foreground leading-tight mb-8" style={{fontFamily:"var(--font-display)"}}>{cur.q}</h2>
              {cur.t==="text"
                ?<textarea autoFocus rows={4} value={(ans[step] as string)||""} onChange={e=>{const u=[...ans];u[step]=e.target.value;setAns(u);}} placeholder="Your answer…"
                    className="w-full bg-transparent border-b-2 border-border focus:border-primary outline-none text-foreground placeholder:text-muted-foreground text-base resize-none py-2 transition-colors"/>
                :<div className="flex gap-3 py-4">{[1,2,3,4,5].map(n=>(
                  <button key={n} onClick={()=>{const u=[...ans];u[step]=n;setAns(u);}}
                    className={`flex-1 h-16 border-2 text-xl font-bold transition-all ${ans[step]===n?"border-primary bg-primary text-primary-foreground":"border-border text-muted-foreground hover:border-foreground hover:text-foreground"}`}
                    style={{fontFamily:"var(--font-mono)"}}>{n}</button>
                ))}</div>
              }
              {submitError&&<div className="text-sm text-red-500 mt-3">{submitError}</div>}
              <div className="flex items-center justify-between mt-10">
                <button onClick={next} disabled={submitting} className="text-[15px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40">Skip</button>
                <button onClick={next} disabled={submitting} className="flex items-center gap-2 bg-primary text-primary-foreground px-7 py-3 text-base font-semibold hover:opacity-90 transition-opacity disabled:opacity-60" style={{fontFamily:"var(--font-display)"}}>
                  {submitting?"Submitting…":step===qs.length-1?"Submit":"Next"} <ArrowRight size={14}/>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
