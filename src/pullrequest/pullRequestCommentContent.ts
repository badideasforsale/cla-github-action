import { CommitterMap } from '../interfaces'
import * as input from '../shared/getInputs'

type Kind = 'cla' | 'dco'

function selectedKind(): Kind {
  // GH Action inputs can't be typed booleans; the input is a string literal.
  return input.getUseDcoFlag() === 'true' ? 'dco' : 'cla'
}

/**
 * Hidden HTML-comment marker appended to every bot comment so the lookup in
 * pullRequestComment.getComment can disambiguate between multiple CLA/DCO
 * jobs running in the same repo (BUG-COMMENT-MARKER / upstream #153).
 *
 * Form: `<!-- cla-lite-bot:<kind>:<workflow>:<job> -->`
 *
 * Existing comments without the marker still match the legacy substring
 * detector and get the marker stamped on next update.
 */
export function commentMarker(kind: Kind = selectedKind()): string {
  const workflow = process.env.GITHUB_WORKFLOW ?? 'default'
  const job = process.env.GITHUB_JOB ?? 'default'
  return `<!-- cla-lite-bot:${kind}:${workflow}:${job} -->`
}

function defaultSignLine(kind: Kind): string {
  const abbrev = kind === 'dco' ? 'DCO' : 'CLA'
  return `I have read the ${abbrev} Document and I hereby sign the ${abbrev}`
}

function signComment(kind: Kind): string {
  return input.getCustomPrSignComment() || defaultSignLine(kind)
}

function botSignature(kind: Kind): string {
  // v3 rebrand: "Self-Hosted CLA/DCO Assistant bot". The legacy substring
  // matcher in pullRequestComment.getComment recognizes both the v3 brand
  // AND the upstream "CLA/DCO Assistant Lite bot" string, so existing PRs
  // from v2.x consumers continue to match on the first v3 run and then
  // get the new marker stamped on next update.
  return kind === 'dco'
    ? '<sub>Posted by the **Self-Hosted DCO Assistant bot**.</sub>'
    : '<sub>Posted by the **Self-Hosted CLA Assistant bot**.</sub>'
}

/**
 * SEC-ESCAPE-AUTHOR-NAME: contributor-controlled strings (git author names
 * from unresolved commit authors) flow into the bot's PR comment. GitHub
 * renders markdown but sanitizes raw HTML, so the dangerous primitives are
 * markdown links (`[text](url)`) and image embeds (`![text](url)`) — an
 * image link is enough to exfiltrate every reviewer's IP via a tracking
 * pixel.
 *
 * Wrapping in backticks renders as inline code, which disables further
 * markdown parsing inside the run. Strip embedded backticks first so the
 * wrapper can't be escaped.
 */
function escapeUserText(s: string): string {
  return '`' + (s ?? '').replace(/`/g, '') + '`'
}

function documentLink(kind: Kind): string {
  const longName =
    kind === 'dco' ? 'Developer Certificate of Origin' : 'Contributor License Agreement'
  return `[${longName}](${input.getPathToDocument()})`
}

export function commentContent(
  signed: boolean,
  committerMap: CommitterMap
): string {
  const kind = selectedKind()
  return render(kind, signed, committerMap) + '\n' + commentMarker(kind)
}

function render(
  kind: Kind,
  signed: boolean,
  committerMap: CommitterMap
): string {
  const abbrev = kind === 'dco' ? 'DCO' : 'CLA'

  if (signed) {
    const line1 =
      input.getCustomAllSignedPrComment() ||
      `All contributors have signed the ${abbrev}  ✍️ ✅`
    return `${line1}<br/>${botSignature(kind)}`
  }

  const signed_count = committerMap?.signed?.length ?? 0
  const not_signed_count = committerMap?.notSigned?.length ?? 0
  const committersCount = signed_count + not_signed_count || 1
  const you = committersCount > 1 ? 'you all' : 'you'

  const lineOne = (
    input.getCustomNotSignedPrComment() ||
    `<br/>Thank you for your submission, we really appreciate it. Like many open-source projects, we ask that $you sign our ${documentLink(kind)} before we can accept your contribution. You can sign the ${abbrev} by just posting a Pull Request Comment same as the below format.<br/>`
  )
    // Token substitution in the user-supplied template (the default text
    // doesn't need it — pathToDocument is already interpolated by JS above).
    .replace(/\$you/g, you)
    .replace(/\$pathToDocument/g, input.getPathToDocument())

  let text = `${lineOne}
   - - -
   ${signComment(kind)}
   - - -
   `

  if (
    committersCount > 1 &&
    committerMap?.signed &&
    committerMap?.notSigned
  ) {
    text += `**${signed_count}** out of **${signed_count + not_signed_count}** committers have signed the ${abbrev}.`
    committerMap.signed.forEach(signedCommitter => {
      // BUG-MARKDOWN-LINK fix: proper [text](url) form. `signedCommitter.name`
      // here is the resolved GitHub login (alphanumeric + hyphen) — safe.
      text += `<br/>:white_check_mark: [${signedCommitter.name}](https://github.com/${signedCommitter.name})`
    })
    committerMap.notSigned.forEach(unsignedCommitter => {
      // BUG-AT-MENTION-GHOST fix: only @-mention when committer has a resolved
      // GitHub user id; otherwise list the raw git author name without `@`.
      // SEC-ESCAPE-AUTHOR-NAME: the unresolved branch's name is contributor-
      // controlled (a git author header — any Unicode), so wrap in backticks
      // to neutralize Markdown (links, images, code fences) before render.
      const mention = unsignedCommitter.id
        ? `@${unsignedCommitter.name}`
        : escapeUserText(unsignedCommitter.name)
      text += `<br/>:x: ${mention}`
    })
    text += '<br/>'
  }

  if (committerMap?.unknown && committerMap.unknown.length > 0) {
    // SEC-ESCAPE-AUTHOR-NAME: every entry here is by definition unresolved —
    // names are raw git author strings. Wrap each in backticks.
    const seem = committerMap.unknown.length > 1 ? 'seem' : 'seems'
    const committerNames = committerMap.unknown.map(c => escapeUserText(c.name))
    text += `**${committerNames.join(', ')}** ${seem} not to be a GitHub user.`
    text += ` You need a GitHub account to be able to sign the ${abbrev}. If you have already a GitHub account, please [add the email address used for this commit to your account](https://help.github.com/articles/why-are-my-commits-linked-to-the-wrong-user/#commits-are-not-linked-to-any-user).<br/>`
  }

  if (input.suggestRecheck() === 'true') {
    text += '<sub>You can retrigger this bot by commenting **recheck** in this Pull Request. </sub>'
  }
  text += botSignature(kind)
  return text
}
