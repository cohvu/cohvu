import React from 'react';
import { Box, Text } from 'ink';
import type { AppState, FlatProject } from '../state.js';
import { truncate } from '../utils.js';

export function ModalView({ state, height }: { state: AppState; height: number }) {
  const modal = state.modal;
  if (!modal) return null;

  const pad = Math.floor(height / 4);

  return (
    <Box flexDirection="column">
      {Array.from({ length: pad }, (_, i) => <Box key={i} height={1} />)}
      <ModalContent modal={modal} state={state} />
    </Box>
  );
}

function ModalContent({ modal, state }: { modal: NonNullable<AppState['modal']>; state: AppState }) {
  switch (modal.kind) {
    case 'confirm-forget':
      return (
        <>
          <Text color="gray">  remove this memory?</Text>
          <Box height={1} />
          <Box>
            <Text color="gray" dimColor>  "</Text>
            <Text color="gray">{truncate(modal.preview, 60)}</Text>
            <Text color="gray" dimColor>"</Text>
          </Box>
          <Box height={1} />
          <Box><Text dimColor>  remove? </Text><Text>(y/n) _</Text></Box>
        </>
      );

    case 'confirm-forget-all':
      return (
        <>
          <Box>
            <Text color="red">  remove all </Text>
            <Text>{String(modal.memoryCount)}</Text>
            <Text color="red"> memories from </Text>
            <Text>{modal.slug}</Text>
            <Text color="red">?</Text>
          </Box>
          <Text color="gray">  project, team, and billing remain intact.</Text>
          <Box height={1} />
          <Box>
            <Text color="gray">  type "</Text>
            <Text dimColor>{modal.slug}</Text>
            <Text color="gray">" to confirm › </Text>
            <Text>{modal.input}_</Text>
          </Box>
        </>
      );

    case 'confirm-delete':
      return (
        <>
          <Box>
            <Text color="red">  permanently delete </Text>
            <Text>{modal.slug}</Text>
            <Text color="red"> and all </Text>
            <Text>{String(modal.memoryCount)}</Text>
            <Text color="red"> memories?</Text>
          </Box>
          <Text color="gray">  this cannot be undone.</Text>
          <Box height={1} />
          <Box>
            <Text color="gray">  type "</Text>
            <Text dimColor>{modal.slug}</Text>
            <Text color="gray">" to confirm › </Text>
            <Text>{modal.input}_</Text>
          </Box>
        </>
      );

    case 'confirm-clear':
      return (
        <>
          <Box>
            <Text color="red">  remove all </Text>
            <Text>{String(modal.memoryCount)}</Text>
            <Text color="red"> memories from </Text>
            <Text>{modal.slug}</Text>
            <Text color="red">?</Text>
          </Box>
          <Text color="gray">  project, team, and billing remain intact.</Text>
          <Box height={1} />
          <Box>
            <Text color="gray">  type "</Text>
            <Text dimColor>{modal.slug}</Text>
            <Text color="gray">" to confirm › </Text>
            <Text>{modal.input}_</Text>
          </Box>
        </>
      );

    case 'confirm-remove-member': {
      const activeProject = state.projects.find(p => p.project_id === state.activeProjectId);
      const contextName = activeProject?.owner.kind === 'team'
        ? activeProject.owner.teamName
        : activeProject?.slug ?? 'the project';
      return (
        <>
          <Box>
            <Text color="gray">  remove </Text>
            <Text dimColor>{modal.email}</Text>
            <Text color="gray"> from </Text>
            <Text dimColor>{contextName}</Text>
            <Text color="gray">?</Text>
          </Box>
          <Box height={1} />
          <Box><Text dimColor>  remove? </Text><Text>(y/n) _</Text></Box>
        </>
      );
    }

    case 'confirm-leave': {
      const name = state.projects.find(p => p.project_id === state.activeProjectId)?.slug ?? 'this project';
      return (
        <>
          <Box>
            <Text color="gray">  leave </Text>
            <Text dimColor>{name}</Text>
            <Text color="gray">?</Text>
          </Box>
          <Text color="gray">  you will lose access immediately.</Text>
          <Box height={1} />
          <Box><Text dimColor>  leave? </Text><Text>(y/n) _</Text></Box>
        </>
      );
    }

    case 'confirm-logout': {
      const email = state.user?.email ?? 'cohvu';
      return (
        <>
          <Box>
            <Text color="gray">  sign out of </Text>
            <Text dimColor>{email}</Text>
            <Text color="gray">?</Text>
          </Box>
          <Box height={1} />
          <Box><Text dimColor>  (y/n) _</Text></Box>
        </>
      );
    }

    case 'rename': {
      const slug = modal.input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      return (
        <>
          <Text color="gray">  rename project</Text>
          <Box height={1} />
          <Box><Text color="gray">  new name › </Text><Text>{modal.input}_</Text></Box>
          <Box>
            <Box width={12}><Text color="gray" dimColor>  slug</Text></Box>
            <Text color="gray">{slug || '(derived from name)'}</Text>
          </Box>
        </>
      );
    }

    case 'create-project': {
      const slug = modal.input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      return (
        <>
          <Text color="gray">  new project</Text>
          <Box height={1} />
          <Box><Text color="gray">  name › </Text><Text>{modal.input || '_'}</Text></Box>
          <Box>
            <Box width={10}><Text color="gray" dimColor>  slug</Text></Box>
            <Text color="gray">{slug || '(derived from name)'}</Text>
          </Box>
        </>
      );
    }

    case 'switch-project': {
      const projects: FlatProject[] = state.projects;
      const activeId = state.activeProjectId;
      const personal = projects.filter(p => p.owner.kind === 'personal');
      const teamGroups = new Map<string, { teamName: string; projects: FlatProject[] }>();
      for (const p of projects) {
        if (p.owner.kind === 'team') {
          const key = p.owner.teamId;
          if (!teamGroups.has(key)) teamGroups.set(key, { teamName: p.owner.teamName, projects: [] });
          teamGroups.get(key)!.projects.push(p);
        }
      }

      let flatIndex = 0;
      const rows: React.ReactNode[] = [];

      if (personal.length > 0) {
        rows.push(<Text key="ph" color="gray" dimColor>  personal</Text>);
        for (const p of personal) {
          const isActive = p.project_id === activeId;
          const isSelected = flatIndex === modal.selected;
          rows.push(
            <Box key={p.project_id}>
              <Text>{isSelected ? '> ' : '  '}</Text>
              <Text>{isActive ? <Text color="green">✓  </Text> : <Text>   </Text>}</Text>
              <Text {...(isSelected ? {} : { color: 'gray' })}>{p.slug}</Text>
            </Box>
          );
          flatIndex++;
        }
      }

      for (const [teamId, group] of teamGroups) {
        rows.push(<Text key={`th-${teamId}`} color="gray" dimColor>  {group.teamName} (team)</Text>);
        for (const p of group.projects) {
          const isActive = p.project_id === activeId;
          const isSelected = flatIndex === modal.selected;
          rows.push(
            <Box key={p.project_id}>
              <Text>{isSelected ? '> ' : '  '}</Text>
              <Text>{isActive ? <Text color="green">✓  </Text> : <Text>   </Text>}</Text>
              <Text {...(isSelected ? {} : { color: 'gray' })}>{p.slug}</Text>
            </Box>
          );
          flatIndex++;
        }
      }

      const newProjectSelected = modal.selected === projects.length;
      rows.push(<Box key="gap" height={1} />);
      rows.push(
        <Box key="new">
          <Text>{newProjectSelected ? '> ' : '  '}</Text>
          <Text {...(newProjectSelected ? {} : { color: 'gray', dimColor: true })}>   + new project</Text>
        </Box>
      );

      return (
        <>
          <Text color="gray">  switch project</Text>
          <Box height={1} />
          {rows}
        </>
      );
    }

    case 'edit-role': {
      const roles = ['admin', 'member', 'viewer'];
      return (
        <>
          <Box>
            <Text color="gray">  change role for </Text>
            <Text dimColor>{modal.targetEmail}</Text>
          </Box>
          <Box height={1} />
          {roles.map((r, i) => (
            <Box key={r}>
              <Text>{i === modal.selected ? '> ' : '  '}</Text>
              <Text {...(i === modal.selected ? {} : { color: 'gray' })}>{r}</Text>
            </Box>
          ))}
        </>
      );
    }

    case 'initiate-consensus': {
      const adminEmails = (state.members ?? [])
        .filter(m => m.role === 'admin')
        .map(m => m.email ?? m.user_id)
        .join(', ');
      return (
        <>
          <Text color="gray">  {modal.description} requires approval from another admin</Text>
          <Box height={1} />
          <Box><Text color="gray">  admins: </Text><Text dimColor>{adminEmails}</Text></Box>
          <Box height={1} />
          <Text color="gray">  initiate? other admins will be notified. expires in 24 hours.</Text>
          <Box height={1} />
          <Box><Text dimColor>  (y/n) _</Text></Box>
        </>
      );
    }

    case 'approve-action':
      return (
        <>
          <Box>
            <Text dimColor>  {modal.initiator}</Text>
            <Text color="gray"> wants to </Text>
            <Text color="red">{modal.description}</Text>
          </Box>
          <Box height={1} />
          <Box><Text color="gray">  expires in </Text><Text color="gray">{modal.expiresIn}</Text></Box>
          <Box height={1} />
          <Box><Text dimColor>  approve? </Text><Text>(y/n) _</Text></Box>
        </>
      );

    case 'confirm-regen-link':
      return (
        <>
          <Box>
            <Text color="gray">  regenerate </Text>
            <Text dimColor>{modal.role}</Text>
            <Text color="gray"> link?</Text>
          </Box>
          <Text color="gray">  old link stops working immediately.</Text>
          <Box height={1} />
          <Box><Text dimColor>  (y/n) _</Text></Box>
        </>
      );

    case 'create-team': {
      const slug = modal.input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      return (
        <>
          <Text color="gray">  new team</Text>
          <Box height={1} />
          <Box><Text color="gray">  name › </Text><Text>{modal.input}_</Text></Box>
          <Box>
            <Box width={10}><Text color="gray" dimColor>  slug</Text></Box>
            <Text color="gray">{slug || '(derived from name)'}</Text>
          </Box>
        </>
      );
    }

    case 'create-team-project': {
      const slug = modal.input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      return (
        <>
          <Box>
            <Text color="gray">  first project in </Text>
            <Text dimColor>{modal.teamName}</Text>
          </Box>
          <Box height={1} />
          <Box><Text color="gray">  name › </Text><Text>{modal.input || '_'}</Text></Box>
          <Box>
            <Box width={10}><Text color="gray" dimColor>  slug</Text></Box>
            <Text color="gray">{slug || '(derived from name)'}</Text>
          </Box>
        </>
      );
    }

    case 'select-owner': {
      const owners: Array<{ label: string; index: number }> = [
        { label: 'personal', index: 0 },
        ...state.teams.map((t, i) => ({ label: `${t.name} (team)`, index: i + 1 })),
      ];
      const newTeamIndex = owners.length;
      const isNewTeamSelected = modal.selected === newTeamIndex;
      return (
        <>
          <Text color="gray">  create project in</Text>
          <Box height={1} />
          {owners.map(o => (
            <Box key={o.index}>
              <Text>{o.index === modal.selected ? '> ' : '  '}</Text>
              <Text {...(o.index === modal.selected ? {} : { color: 'gray' })}>{o.label}</Text>
            </Box>
          ))}
          <Box height={1} />
          <Box>
            <Text>{isNewTeamSelected ? '> ' : '  '}</Text>
            <Text {...(isNewTeamSelected ? {} : { color: 'gray', dimColor: true })}>+ new team</Text>
          </Box>
        </>
      );
    }

    case 'invite': {
      const roles = ['admin', 'member', 'viewer'];
      return (
        <>
          <Text color="gray">  invite as</Text>
          <Box height={1} />
          {roles.map((r, i) => (
            <Box key={r}>
              <Text>{i === modal.selected ? '> ' : '  '}</Text>
              <Text {...(i === modal.selected ? {} : { color: 'gray' })}>{r}</Text>
            </Box>
          ))}
        </>
      );
    }

    case 'invite-link':
      return (
        <>
          <Box>
            <Text dimColor>{modal.role}</Text>
            <Text color="gray"> invite link</Text>
          </Box>
          <Box height={1} />
          <Text>{modal.url}</Text>
          <Box height={1} />
          {state.copiedFeedback
            ? <Text color="green">  copied!</Text>
            : <Box><Text dimColor>  c</Text><Text color="gray"> copy   </Text><Text dimColor>o</Text><Text color="gray"> open in browser</Text></Box>
          }
        </>
      );

    case 'configure-sso': {
      const ssoRoles = ['member', 'viewer', 'admin'];
      return (
        <>
          <Text color="gray">  configure sso</Text>
          <Box height={1} />
          {modal.step === 1 && (
            <Box><Text color="gray">  issuer url › </Text><Text>{modal.issuer}_</Text></Box>
          )}
          {modal.step === 2 && (
            <Box><Text color="gray">  client id › </Text><Text>{modal.clientId}_</Text></Box>
          )}
          {modal.step === 3 && (
            <Box><Text color="gray">  client secret › </Text><Text>{'•'.repeat(modal.clientSecret.length)}_</Text></Box>
          )}
          {modal.step === 4 && (
            <Box><Text color="gray">  allowed domains › </Text><Text>{modal.domains}_</Text></Box>
          )}
          {modal.step === 5 && (
            <>
              <Text color="gray" dimColor>  default role for new members</Text>
              <Box height={1} />
              {ssoRoles.map((r, i) => (
                <Box key={r}>
                  <Text>{i === modal.defaultRole ? '> ' : '  '}</Text>
                  <Text {...(i === modal.defaultRole ? {} : { color: 'gray' })}>{r}</Text>
                </Box>
              ))}
            </>
          )}
          {modal.step === 6 && (
            <>
              <Text color="gray">  require sso for all team members?</Text>
              <Box height={1} />
              <Box><Text>{modal.requireSso ? '> ' : '  '}</Text><Text {...(modal.requireSso ? {} : { color: 'gray' })}>yes</Text></Box>
              <Box><Text>{!modal.requireSso ? '> ' : '  '}</Text><Text {...(!modal.requireSso ? {} : { color: 'gray' })}>no</Text></Box>
            </>
          )}
          {modal.step === 7 && (
            <>
              <Box><Text color="gray" dimColor>  issuer   </Text><Text>{modal.issuer}</Text></Box>
              <Box><Text color="gray" dimColor>  client   </Text><Text>{modal.clientId}</Text></Box>
              <Box><Text color="gray" dimColor>  secret   </Text><Text>{modal.clientSecret ? '••••••••' : '(none)'}</Text></Box>
              <Box><Text color="gray" dimColor>  domains  </Text><Text>{modal.domains || '(any)'}</Text></Box>
              <Box><Text color="gray" dimColor>  role     </Text><Text>{ssoRoles[modal.defaultRole] ?? 'member'}</Text></Box>
              <Box><Text color="gray" dimColor>  require  </Text><Text>{modal.requireSso ? 'yes' : 'no'}</Text></Box>
              <Box height={1} />
              <Box><Text dimColor>  confirm? </Text><Text>(y/n) _</Text></Box>
            </>
          )}
        </>
      );
    }

    case 'confirm-delete-team': {
      return (
        <>
          <Box>
            <Text color="red">  permanently delete </Text>
            <Text>{modal.teamName}</Text>
            <Text color="red">?</Text>
          </Box>
          <Text color="gray">  this cannot be undone.</Text>
          <Box height={1} />
          <Box>
            <Text color="gray">  type "</Text>
            <Text dimColor>{modal.slug}</Text>
            <Text color="gray">" to confirm › </Text>
            <Text>{modal.input}_</Text>
          </Box>
        </>
      );
    }

    case 'manage-sso': {
      const sso = state.ssoConfig;
      return (
        <>
          <Text color="gray">  sso configuration</Text>
          <Box height={1} />
          {sso ? (
            <>
              <Box><Box width={12}><Text color="gray" dimColor>  issuer</Text></Box><Text dimColor>{sso.issuer}</Text></Box>
              <Box><Box width={12}><Text color="gray" dimColor>  domains</Text></Box><Text dimColor>{sso.allowed_domains.join(', ')}</Text></Box>
              <Box><Box width={12}><Text color="gray" dimColor>  role</Text></Box><Text dimColor>{sso.default_role}</Text></Box>
              <Box><Box width={12}><Text color="gray" dimColor>  require</Text></Box><Text dimColor>{sso.require_sso ? 'yes' : 'no'}</Text></Box>
            </>
          ) : (
            <Text color="gray">  not configured</Text>
          )}
        </>
      );
    }

    case 'confirm-rename-team': {
      const slug = modal.input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      return (
        <>
          <Text color="gray">  rename team</Text>
          <Box height={1} />
          <Box><Text color="gray">  new name › </Text><Text>{modal.input}_</Text></Box>
          <Box>
            <Box width={12}><Text color="gray" dimColor>  slug</Text></Box>
            <Text color="gray">{slug || '(derived from name)'}</Text>
          </Box>
        </>
      );
    }
  }
}
