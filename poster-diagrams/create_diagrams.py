from pathlib import Path
from html import escape
from PIL import Image, ImageDraw, ImageFont
import math

OUT = Path(__file__).parent
INK = '#183047'
MUTED = '#536577'
LINE = '#718396'

class Diagram:
    def __init__(self, name, w, h, title, subtitle, color):
        self.name, self.w, self.h, self.color = name, w, h, color
        self.im = Image.new('RGB', (w*2, h*2), 'white')
        self.d = ImageDraw.Draw(self.im)
        self.svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">', '<rect width="100%" height="100%" fill="white"/>']
        self.text(w/2, 52, title, 32, INK, True)
        self.text(w/2, 94, subtitle, 18, MUTED)
        self.line([(48,125),(w-48,125)], '#e2e8ef', 2)
    def text(self,x,y,t,size=21,color=INK,bold=False):
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans'+('-Bold' if bold else '')+'.ttf',size*2)
        self.d.text((x*2,y*2),t,font=font,fill=color,anchor='mm')
        self.svg.append(f'<text x="{x}" y="{y}" text-anchor="middle" dominant-baseline="central" font-family="DejaVu Sans, sans-serif" font-size="{size}" font-weight="{700 if bold else 400}" fill="{color}">{escape(t)}</text>')
    def line(self,pts,color=LINE,width=2):
        self.d.line([(x*2,y*2) for x,y in pts],fill=color,width=width*2)
        self.svg.append(f'<polyline points="{" ".join(f"{x},{y}" for x,y in pts)}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linejoin="round"/>')
    def arrow(self,pts,label=None,lx=None,ly=None):
        self.line(pts)
        x,y=pts[-1]; px,py=pts[-2]; a=math.atan2(y-py,x-px)
        tri=[(x,y),(x-11*math.cos(a-.45),y-11*math.sin(a-.45)),(x-11*math.cos(a+.45),y-11*math.sin(a+.45))]
        self.d.polygon([(a*2,b*2) for a,b in tri],fill=LINE)
        self.svg.append(f'<polygon points="{" ".join(f"{a},{b}" for a,b in tri)}" fill="{LINE}"/>')
        if label:self.text(lx,ly,label,16,MUTED)
    def box(self,x,y,w,h,title,detail='',fill='#f1f6fa',color=None):
        color=color or self.color
        self.d.rounded_rectangle((x*2,y*2,(x+w)*2,(y+h)*2),radius=24,fill=fill,outline=color,width=3)
        self.svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{fill}" stroke="{color}" stroke-width="1.5"/>')
        titles=title.split('\n'); details=detail.split('\n') if detail else []
        total=len(titles)*29+len(details)*24+(8 if details else 0)
        yy=y+(h-total)/2+14
        for t in titles:self.text(x+w/2,yy,t,22,INK,True); yy+=29
        if details: yy+=6
        for t in details:self.text(x+w/2,yy,t,17,MUTED); yy+=24
    def diamond(self,x,y,w,h,label):
        pts=[(x+w/2,y),(x+w,y+h/2),(x+w/2,y+h),(x,y+h/2)]
        self.d.polygon([(a*2,b*2) for a,b in pts],fill='#fff8e9',outline=self.color,width=3)
        self.svg.append(f'<polygon points="{" ".join(f"{a},{b}" for a,b in pts)}" fill="#fff8e9" stroke="{self.color}" stroke-width="1.5"/>')
        for i,t in enumerate(label.split('\n')):self.text(x+w/2,y+h/2+(i-(len(label.split('\n'))-1)/2)*27,t,20,INK,True)
    def save(self):
        (OUT/(self.name+'.svg')).write_text('\n'.join(self.svg+['</svg>']))
        self.im.save(OUT/(self.name+'.png'),dpi=(300,300))

# Overall: evidence converges in a human decision, not a combined numeric score.
d=Diagram('01-overall-methodology',1500,880,'Pulse: Understand, Improve, Learn','A continuous cycle of project monitoring, team feedback, and informed action','#4d77ac')
d.box(60,185,300,110,'Collect project data','From the tools teams use')
d.box(425,185,300,110,'Check project health','Scores and changes over time')
d.arrow([(360,240),(425,240)])
d.box(425,390,300,110,'Hear from the team','AI-written surveys\nAnonymous feedback',fill='#edf8f5',color='#3b9180')
d.arrow([(575,295),(575,390)],'Guides questions',660,340)
d.box(825,280,300,135,'Understand concerns','Review tool findings\nand survey insights')
d.arrow([(725,240),(770,240),(770,315),(825,315)])
d.arrow([(725,445),(770,445),(770,380),(825,380)])
d.box(1185,280,255,135,'Take and record\naction','Use past experience',fill='#fff7ea',color='#b58a3c')
d.arrow([(1125,348),(1185,348)])
d.box(1185,565,255,110,'Review outcomes','Rate what worked',fill='#fff7ea',color='#b58a3c')
d.arrow([(1312,415),(1312,565)])
d.box(825,565,300,110,'Keep the learning','Searchable action history',fill='#fff7ea',color='#b58a3c')
d.arrow([(1185,620),(1125,620)])
d.arrow([(975,565),(975,470),(1148,470),(1148,235),(1312,235),(1312,280)],'Helps future choices',1035,452)
d.arrow([(1185,648),(1148,648),(1148,750),(210,750),(210,295)],'Keep monitoring changes',665,730)
d.text(575,536,'Surveys run monthly or on request.',17,MUTED)
d.text(750,822,'Tool scores and survey insights provide separate evidence for team decisions.',18,MUTED)
d.save()

d=Diagram('02-ingestion-module',1000,1290,'Ingestion: From Tools to Health Scores','Collect, organize, and interpret engineering data','#4d77ac')
steps=[('Start a sync','Manual request or scheduled update'),('Load connected tools','GitHub / GitLab · Jira\nSonarQube · GitHub Actions'),('Collect metrics in parallel','Each connector reads its tool’s data'),('Organize and save the data','Standard metrics in a dated project snapshot'),('Calculate seven health scores','Weight the available signals\nAdjust weights when signals are missing'),('Calculate overall health','Average the available category scores'),('Show scores and trends','Update the dashboard and health history')]
for i,(t,s) in enumerate(steps):
 y=165+i*145;d.box(210,y,580,105,t,s)
 if i:d.arrow([(500,y-40),(500,y)])
d.arrow([(790,1087),(880,1087),(880,216),(790,216)],'Repeat',915,660)
d.text(500,1210,'Health scores and trends also guide survey questions.',19,MUTED)
d.save()

d=Diagram('03-survey-module',1000,1590,'Surveys: From Signals to Team Insights','Use project context to ask useful questions and understand feedback','#3b9180')
steps=[('Start a survey cycle','Manual request or monthly schedule'),('Read project health context','Latest scores, trends, and tool metrics'),('Generate and select questions','AI drafts questions; remove duplicates\nScore quality and select the best questions'),('Allow admin review and edits','Send now or automatically when due\nAdmins can pause before sending'),('Share one survey link','Send through team channels and email'),('Collect anonymous answers','Save responses without identifying the person'),('Close the survey','At the deadline or when closed by an admin')]
for i,(t,s) in enumerate(steps):
 y=160+i*143;d.box(210,y,580,106,t,s,fill='#edf8f5')
 if i:d.arrow([(500,y-37),(500,y)])
d.arrow([(500,1124),(500,1155)])
d.diamond(365,1155,270,110,'Answers\navailable?')
d.arrow([(500,1265),(500,1310)],'Yes',530,1285)
d.box(210,1310,580,115,'Analyze and summarize','AI produces category assessments,\nthemes, and question summaries',fill='#edf8f5')
d.arrow([(635,1210),(735,1210)],'No',685,1190)
d.box(735,1155,240,110,'Finish without\nscored insights',fill='#f7f8fa')
d.text(500,1480,'Managers use these insights to understand concerns and choose actions.',17,MUTED)
d.text(500,1515,'Survey results stay separate from tool-based health scores.',18,MUTED)
d.save()

d=Diagram('04-action-module',1000,1430,'Actions: From Problems to Shared Learning','Find past experience, record interventions, and review outcomes','#b58a3c')
steps=[('Describe the problem','Identify the concern and likely cause'),('Find similar past actions','Keyword search or optional AI Deep Search'),('Review past experience','Read relevant actions and effectiveness ratings'),('Take and record action','The team carries out the intervention\nSave the cause, action, date, and projects'),('Review the outcome','Use observed results to judge effectiveness')]
for i,(t,s) in enumerate(steps):
 y=165+i*150;d.box(210,y,450 if i==4 else 580,110,t,s,fill='#fff7ea')
 if i:d.arrow([(500,y-40),(500,y)])
d.arrow([(500,875),(500,925)])
d.diamond(350,925,300,120,'Ready to\nassess?')
d.arrow([(500,1045),(500,1090)],'Yes',530,1065)
d.box(210,1090,580,100,'Save effectiveness rating','Team member rates the action from 1 to 5',fill='#fff7ea')
d.arrow([(650,985),(840,985),(840,865)],'No',730,964)
d.box(720,755,255,110,'Set a later review','Wait for more evidence',fill='#f7f8fa')
d.arrow([(840,755),(840,725),(500,725),(500,765)])
d.arrow([(500,1190),(500,1240)])
d.box(210,1240,580,100,'Keep searchable action history','Past actions and ratings inform future decisions',fill='#fff7ea')
d.arrow([(210,1290),(105,1290),(105,370),(210,370)])
d.text(500,1384,'Pulse supports decisions; the team performs and evaluates the action.',17,MUTED)
d.save()

# One compact preview for review in conversation.
thumbs=[]
for name in ['01-overall-methodology','02-ingestion-module','03-survey-module','04-action-module']:
 im=Image.open(OUT/(name+'.png')); im.thumbnail((740,790)); thumbs.append(im)
sheet=Image.new('RGB',(1540,1660),'#e9eef3')
for im,(x,y) in zip(thumbs,[(20,20),(790,20),(20,850),(790,850)]):
 sheet.paste(im,(x+(730-im.width)//2,y))
sheet.save(OUT/'preview.png')
