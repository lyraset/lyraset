import MediaImage from '@/components/MediaImage';
import Icon from '@/components/Icon';
import Reveal from '@/components/motion/Reveal';
import '@/styles/team.scss';

/** Team roster used by /team. Members are managed in the Team module. */
export default function TeamGrid({ data = {}, team = [] }) {
  if (team.length === 0) return null;

  return (
    <section className={`section ${data.background === 'grey' ? 'section--grey' : ''}`}>
      <div className="container-x">
        <div className="team-list">
          {team.map((m) => (
            <Reveal as="article" className="team-profile" key={m._id || m.name}>
              <div className="team-profile__media">
                <MediaImage
                  media={m.photo}
                  label={m.name}
                  ratio="4/5"
                  rounded
                  sizes="(max-width: 860px) 60vw, 250px"
                />
                {m.type === 'group' && <span className="team-profile__badge">Team</span>}
              </div>
              <div className="team-profile__body">
                <h2 className="team-profile__name">{m.name}</h2>
                <p className="team-profile__role">{m.role}</p>
                {m.skills?.length > 0 && (
                  <ul className="team-profile__skills">
                    {m.skills.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                )}
                {m.bio && <p className="team-profile__bio">{m.bio}</p>}
                {m.socials?.length > 0 && (
                  <div className="team-profile__socials">
                    {m.socials.map((s) => (
                      <a
                        key={s.platform}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={s.platform}
                      >
                        <Icon name={s.platform} size={16} />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
