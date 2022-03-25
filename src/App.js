import './App.css';
import React from 'react';
import Cookies from './cookies'; 
import { styled, alpha, Button, Container, List, ListItem, Snackbar, Stack, Typography } from '@mui/material';
import InputBase from '@mui/material/InputBase';
import SearchIcon from '@mui/icons-material/Search';
import Loading from './Loading';
import Tweet from './Tweet';
import { userLookup } from './utils';

const request = async (url, method = 'GET', body = '') => {
  return await fetch('/request', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-type': 'application/json'
    },
    body: JSON.stringify({
      url: url.toString(),
      method: method,
      body: body
    })
  });
}

const paginatedRequest = async (url, method = 'GET', body = '') => {
  let out = {data: [], includes: {users: []}, meta: {}};
  let i = 0;
  do {
    i++;

    if (i > 5) {
      break;
    }

    if (out.meta.next_token) {
      url.searchParams.set('paginationToken', out.response?.meta.next_token);
    }

    const response = await request(url, method, body);
    const json = await response.json();

    if (!(response.ok && json.response.data)) {
      break;
    }

    out.data = [...out.data, ...json.response.data];
    out.includes.users = [...out.includes.users, ...json.response.includes?.users ?? []];
    out.meta = json.response.meta ?? out.meta;

    if (!json.response.meta) {
      out.meta.next_token = null;
    }
  } while (out.meta.next_token);

  return out;
}

const Search = styled('div')(({ theme }) => ({
  position: 'relative',
  borderRadius: theme.shape.borderRadius,
  backgroundColor: alpha(theme.palette.common.white, 0.15),
  '&:hover': {
    backgroundColor: alpha(theme.palette.common.white, 0.25),
  },
  width: '100%',
  [theme.breakpoints.up('sm')]: {
    marginLeft: theme.spacing(3),
    width: 'auto',
  },
}));

const SearchIconWrapper = styled('div')(({ theme }) => ({
  padding: theme.spacing(0, 2),
  height: '100%',
  position: 'absolute',
  pointerEvents: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}));

const StyledInputBase = styled(InputBase)(({ theme }) => ({
  color: 'inherit',
  '& .MuiInputBase-input': {
    padding: theme.spacing(1, 1, 1, 0),
    // vertical padding + font size from searchIcon
    paddingLeft: `calc(1em + ${theme.spacing(4)})`,
    transition: theme.transitions.create('width'),
    width: '100%',
    [theme.breakpoints.up('md')]: {
      width: '20ch',
    },
  },
}));


const hasValidToken = () => {
  const token = Cookies.get('twitter_token');
  if (!token) {
    return false;
  }

  const tokenExpiration = new Date(token.expires_at);
  if (tokenExpiration < new Date()) {
    return false;
  }

  return true;
}

export default class App extends React.Component {
  state = {
    error: false,
    loading: true,
    tweets: {data: [], includes: [], meta: {}},
    results: {data: [], includes: [], meta: {}},
  };

  constructor(props) {
    super(props);
    this.searchRef = React.createRef();
  }

  async componentDidMount() {    
    try {
      const myUser = await request('https://api.twitter.com/2/users/me');
      const myUserResponse = await myUser.json();
      const { id } = myUserResponse.response.data;
  
      const myBookmarksURL = new URL(`https://api.twitter.com/2/users/${id}/bookmarks`);
      myBookmarksURL.searchParams.append('tweet.fields', 'context_annotations,created_at');
      myBookmarksURL.searchParams.append('expansions', 'author_id');
      myBookmarksURL.searchParams.append('user.fields', 'verified,profile_image_url');
  
      const myBookmarks = await paginatedRequest(myBookmarksURL);
      this.setState({loading: false, tweets: myBookmarks, results: myBookmarks});
      this.searchRef.current.querySelector('input').focus()
    } catch (e) {
      console.error(e);
      this.setState({error: true, loading: false});
    }
  }

  async retry() {
    this.setState({error: false});
    await this.request();
  }

  search(e) {
    if (!e.target.value) {
      this.setState({results: this.state.tweets});
      return;
    }

    const value = e.target.value.toLowerCase();

    const results = this.state.tweets.data.filter(tweet => {
      const annotations = tweet.context_annotations?.map(({entity}) => entity.name) ?? [];
      const user = userLookup(tweet.author_id, this.state.tweets);
      const result = [
        tweet.text, 
        user.name, 
        user.username,
        ...annotations
      ].find(token => token.toLowerCase().match(value));
      
      if (result) {
        return tweet;
      }
    });

    this.setState({results: {data: results, includes: this.state.tweets.includes, meta: this.state.tweets.meta}});
  }

  render() {
    if (!hasValidToken()) {
      return <Stack
        direction="column"
        justifyContent="center"
        alignItems="center"
        spacing={2}>
          <Container maxWidth='sm'>
            <Typography variant='h5'>Authorize Twitter so can I read your Bookmarks.</Typography>
            <Typography variant='p'>This app only be able to read your bookmarks. It will never Tweet on your behalf.</Typography>
          </Container>
          <Button variant="contained" href={`${process.env.REACT_APP_BACKEND_URL ?? ''}/authorize/twitter`} service="twitter">Authorize Twitter</Button>
      </Stack>;
    }

    if (this.state.loading) {
      return <List
        height={400}
        width={600}>
        <Loading />
      </List>
    }

    return <Container maxWidth='sm'>
      <Snackbar 
        open={this.state.error} 
        message='Cannot read your bookmarks.'
        action={
          <Button color='inherit' size='small' onClick={async () => await this.retry()}>
            Retry
          </Button>
        }>
      </Snackbar>

      <Search>
        <SearchIconWrapper>
          <SearchIcon />
        </SearchIconWrapper>
        <StyledInputBase
          ref={this.searchRef}
          onChange={(e) => this.search(e)}
          placeholder="Search your bookmarks"
          inputProps={{ 'aria-label': 'search' }}
        />
      </Search>
      <Typography variant='body'>
        {this.state.results && this.state.results.data.length === 1 ? '1 bookmark' : `${this.state.results.data.length} bookmarks`}
      </Typography>
      <List
        height={400}
        width={600}>
        {this.state.results && this.state.results?.data.length === 0 ? <ListItem><Container>No bookmarks</Container></ListItem> :
        this.state.results.data.map(tweet => <ListItem><Tweet tweet={tweet} response={this.state.results} /></ListItem>)}
      </List>
    </Container>;
  }
}