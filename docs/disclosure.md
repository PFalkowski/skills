# Disclosure gate

A public issue or PR comment about a vulnerability in shipped code tells attackers where to look before a fix exists. This gate keeps such findings off public text.

**Scope.** It applies before any skill files a ticket, or writes PR text (a reply, a summary-thread row), about a security finding in code already on the default branch. That covers Carried, sibling, pre-existing and DEFER-ed findings. A security finding is one an outsider could exploit, including a data leak, or data loss that crafted input or access can trigger. When unsure, treat it as one. Other findings, and a finding in an unmerged PR's own diff, take the normal channel.

1. **Resolve visibility.** Run `gh repo view --json visibility -q .visibility`. Anything not confirmed `PRIVATE` or `INTERNAL` counts as public. That includes a failed check and a tracker off GitHub whose visibility cannot be read.
2. **Route.** On a public repo the finding never goes to a public issue or PR text. It goes to a draft repository security advisory (GitHub REST `POST /repos/{owner}/{repo}/security-advisories`), where a fix and a CVE (Common Vulnerabilities and Exposures identifier) can follow. If that is unavailable (no permission, not GitHub), tell the human in chat, or in a headless run put it in the report returned to the caller, and write nothing down. A PR reply or summary thread says only that the finding is tracked privately.
3. **Say so.** The run's report names each withheld finding and where it went.

This overrides `tickets=file`, `post=post`, `reply=post` and `CLAUDE_AUTONOMY=autonomous`. None of it applies on a private repo.

[nights-watch HUNT.md § Disclosure](../nights-watch/HUNT.md#disclosure-hunt-rule-4-concretely) is the same rule for hunts.
