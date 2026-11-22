/**
 * 生成测试用 MusicXML（无依赖，手写 XML）。
 * 覆盖：divisions=2、tempo=90、C4 四分 + E4 八分、G4/B4 和弦、跨音连音。
 * 用法：node fixtures/make-musicxml.mjs [output.musicxml]
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const output = process.argv[2] || fileURLToPath(new URL('./demo.musicxml', import.meta.url));

const xml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>MusicXML Demo</work-title></work>
  <movement-title>MusicXML Demo</movement-title>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
    <score-part id="P2"><part-name>Violin</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>2</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction placement="above"><direction-type><metronome><per-minute>90</per-minute></metronome></direction-type><sound tempo="90"/></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>eighth</type></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type></note>
      <note><chord/><pitch><step>B</step><octave>4</octave></pitch><duration>2</duration><type>quarter</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><type>half</type><tie type="start"/></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><type>half</type><tie type="stop"/></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes><divisions>1</divisions></attributes>
      <note><pitch><step>D</step><alter>-1</alter><octave>4</octave></pitch><duration>4</duration><type>whole</type></note>
    </measure>
  </part>
</score-partwise>
`;
fs.writeFileSync(output, xml, 'utf8');
console.log(`Wrote ${output} (${xml.length} chars)`);
