// Reiimei, the iPhone app (milestone 1): a list of notes and a note to write in, typed into iOS's
// own text box, so dictation, capitals, predictive text, holding delete and moving the cursor all
// behave as in Apple's apps. Notes are kept on the phone for now; sync and the rest follow.
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as store from './store';

const LIGHT = { paper: '#f7f8fa', sheet: '#fcfdfe', ink: '#1c2430', ink2: '#5d6775', ink3: '#8b94a1', rule: '#dde2e8', accent: '#3d6a99', gold: '#8a6a1f' };
const DARK = { paper: '#10141a', sheet: '#151a21', ink: '#e8ecf1', ink2: '#a9b2be', ink3: '#7b8594', rule: '#2a313b', accent: '#86aee0', gold: '#d6b25e' };

const titleOf = (n) => String(n.meta?.title || '').trim() || (n.body || '').split('\n').find((l) => l.trim())?.trim() || 'New note';
const snippetOf = (n) => (n.body || '').split('\n').filter((l) => l.trim()).slice(String(n.meta?.title || '').trim() ? 0 : 1).join(' ').slice(0, 90);
const dayOf = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'long' });

function NoteList({ c, notes, onOpen, onNew }) {
  return (
    <SafeAreaView style={[s.fill, { backgroundColor: c.paper }]} edges={['top', 'left', 'right']}>
      <View style={[s.head, { borderBottomColor: c.rule }]}>
        <Text style={[s.brand, { color: c.ink }]}>reiimei</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="New note" onPress={onNew} hitSlop={12}>
          <Text style={[s.headBtn, { color: c.accent }]}>New</Text>
        </Pressable>
      </View>
      <FlatList
        data={notes}
        keyExtractor={(n) => n.id}
        ListEmptyComponent={<Text style={[s.empty, { color: c.ink3 }]}>No notes yet. Tap New to start one.</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => onOpen(item)} style={({ pressed }) => [s.item, { borderBottomColor: c.rule, backgroundColor: pressed ? c.sheet : 'transparent' }]}>
            <Text style={[s.itemTitle, { color: c.ink }]} numberOfLines={1}>{titleOf(item)}</Text>
            <Text style={[s.itemMeta, { color: c.ink3 }]} numberOfLines={1}>{new Date(item.updated_at).toLocaleString()}  {snippetOf(item)}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

function Editor({ c, note, onBack, onChange }) {
  const [title, setTitle] = useState(String(note.meta?.title || ''));
  const [body, setBody] = useState(note.body || '');
  const timer = useRef(null);
  const latest = useRef({ title, body });
  latest.current = { title, body };
  // Saved a moment after you stop typing, and when you leave the note.
  const save = useCallback(() => onChange({ body: latest.current.body, meta: { ...(note.meta || {}), title: latest.current.title } }), [note, onChange]);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(save, 600);
    return () => clearTimeout(timer.current);
  }, [title, body, save]);
  const words = (body.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) || []).length;
  return (
    <SafeAreaView style={[s.fill, { backgroundColor: c.sheet }]} edges={['top', 'left', 'right', 'bottom']}>
      <View style={[s.head, { borderBottomColor: c.rule }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to notes" onPress={() => { clearTimeout(timer.current); save(); onBack(); }} hitSlop={12}>
          <Text style={[s.headBtn, { color: c.accent }]}>‹ Notes</Text>
        </Pressable>
        <Text style={[s.brand, { color: c.ink }]}>reiimei</Text>
        <View style={{ width: 60 }} />
      </View>
      <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text style={[s.eyebrow, { color: c.gold }]}>{`NOTE / ${dayOf(note.created_at).toUpperCase()}`}</Text>
        <TextInput
          style={[s.title, { color: c.ink }]}
          value={title}
          onChangeText={setTitle}
          placeholder={titleOf({ ...note, body, meta: {} })}
          placeholderTextColor={c.ink3}
          autoCapitalize="sentences"
          returnKeyType="next"
          multiline={false}
        />
        {/* iOS's own text box: Apple's keyboard handles dictation, capitals and the cursor. */}
        <TextInput
          style={[s.body, { color: c.ink }]}
          value={body}
          onChangeText={setBody}
          multiline
          autoFocus={!note.body}
          autoCapitalize="sentences"
          autoCorrect
          spellCheck
          textAlignVertical="top"
          scrollEnabled
          placeholder="Begin writing."
          placeholderTextColor={c.ink3}
        />
        <Text style={[s.count, { color: c.ink3 }]}>{`${words} ${words === 1 ? 'word' : 'words'} · ${body.replace(/\n/g, '').length} characters`}</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function App() {
  const c = useColorScheme() === 'dark' ? DARK : LIGHT;
  const [notes, setNotes] = useState([]);
  const [open, setOpen] = useState(null);
  const reload = useCallback(async () => setNotes(await store.allNotes()), []);
  useEffect(() => { reload(); }, [reload]);
  const onNew = async () => setOpen(await store.createNote());
  const onChange = useCallback(async (changes) => {
    setOpen((cur) => {
      if (!cur) return cur;
      const changed = changes.body !== cur.body || (changes.meta?.title || '') !== (cur.meta?.title || '');
      if (changed) store.saveNote(cur, changes).catch(() => {});
      return changed ? { ...cur, ...changes } : cur;
    });
  }, []);
  const onBack = async () => {
    if (open) await store.dropIfBlank(open);
    setOpen(null);
    reload();
  };
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {open
        ? <Editor key={open.id} c={c} note={open} onBack={onBack} onChange={onChange} />
        : <NoteList c={c} notes={notes} onOpen={setOpen} onNew={onNew} />}
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  head: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 19, borderBottomWidth: StyleSheet.hairlineWidth },
  brand: { fontFamily: 'Georgia', fontSize: 15, letterSpacing: 3 },
  headBtn: { fontSize: 16, minWidth: 60 },
  empty: { textAlign: 'center', marginTop: 60, fontSize: 15 },
  item: { paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  itemTitle: { fontSize: 17, fontWeight: '600' },
  itemMeta: { fontSize: 13, marginTop: 3 },
  eyebrow: { fontSize: 10, letterSpacing: 2, fontWeight: '600', paddingHorizontal: 25, paddingTop: 22 },
  title: { fontFamily: 'Georgia', fontSize: 24, paddingHorizontal: 25, paddingTop: 12, paddingBottom: 4 },
  body: { flex: 1, fontFamily: 'Georgia', fontSize: 17, lineHeight: 26, paddingHorizontal: 25, paddingTop: 10 },
  count: { fontSize: 11.5, paddingHorizontal: 25, paddingVertical: 8 },
});
